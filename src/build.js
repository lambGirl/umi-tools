
// babel库
const babel = require('@babel/core');
// node命令转化成对象
const yParser = require('yargs-parser');
//  文件路径
const { join, extname, sep } = require('path');
// 文件流读取
const { existsSync, statSync, readdirSync } = require('fs');
// 来自Node.js的assert模块，断言(assert)
const assert = require('assert');
// 日志
const log = require('./utils/log');
// 将Windows反斜杠路径转换为斜杠路径：foo \\ bar➔foo / bar
const slash = require('slash2');
//  Terminal 字符串样式输出包
const chalk = require('chalk');
// 节点的UNIX命令rm -rf。使用npm install rimraf安装，或将rimraf.js放到某个地方。
const rimraf = require('rimraf');
// Vinyl是描述文件的非常简单的元数据对象。
// 当您想到文件时，会想到两个属性：路径和内容。
// 这些是Vinyl对象的主要属性。
// 文件不一定代表您计算机文件系统中的某些内容。
// 您在S3，FTP，Dropbox，Box，CloudThingly.io和其他服务上都有文件。
// vinyl-fs可用于描述所有这些来源的文件。
const vfs = require('vinyl-fs');
// 围绕Node.js Streams.Transform（Streams2 / 3）的小包装，以避免显式子类化噪音
const through = require('through2');
// node.js fs.watch / fs.watchFile / FSEvents周围的整洁包装
const chokidar = require('chokidar');
// cwd是指当前node命令执行时所在的文件夹目录；
const cwd = process.cwd();

let pkgCount = null;

function getBabelConfig(isBrowser, path) {
  // 如果转化的对象，如果是浏览器告知兼容行
  const targets = isBrowser
    ? {
      browsers: ['last 2 versions', 'IE 10'],
    }
    : { node: 6 };
  // 组装对应的babel配置
  /**
   * 1. 支持编译typescript
   * 2. babel编译支持的端，浏览器或者node
   * 3. 支持对react的编译
   * 4. 支持浏览器端 export-default的导出方式（编译导出默认为ES2015）
   * 5. 将do表达式编译为ES5
   * 6. 此插件可转换静态类属性以及使用属性初始化程序语法声明的属性
   */
  return {
    presets: [
      [
        require.resolve('@babel/preset-typescript'),
        {},
      ],
      [
        require.resolve('@babel/preset-env'),
        {
          targets,
          ...(isBrowser ? { modules: false } : {}),
        },
      ],
      ...(isBrowser ? [require.resolve('@babel/preset-react')] : []),
    ],
    plugins: [
      require.resolve('@babel/plugin-proposal-export-default-from'),
      require.resolve('@babel/plugin-proposal-do-expressions'),
      require.resolve('@babel/plugin-proposal-class-properties'),
    ],
  }
}

// 格式化处理路径
function addLastSlash(path) {
  return path.slice(-1) === '/' ? path : `${path}/`;
}

function transform(opts = {}) {
  // 获取对应的文件content， 路径path; 包及根目录
  const { content, path, pkg, root } = opts;
  assert(content, `opts.content should be supplied for transform()`);
  assert(path, `opts.path should be supplied for transform()`);
  assert(pkg, `opts.pkg should be supplied for transform()`);
  assert(root, `opts.root should be supplied for transform()`);
  assert(['.js', '.ts'].includes(extname(path)), `extname of opts.path should be .js, .ts or .tsx`);

  const { browserFiles } = pkg.umiTools || {};

  const isBrowser = browserFiles && browserFiles.includes(slash(path).replace(`${addLastSlash(slash(root))}`, ''));
  // 获取babel配置
  const babelConfig = getBabelConfig(isBrowser, path);

  log.transform(
    chalk[isBrowser ? 'yellow' : 'blue'](
      `${slash(path).replace(`${cwd}/`, '')}`,
    ),
  );
  // 执行babel的转化
  return babel.transform(content, {
    ...babelConfig,
    filename: path,
  }).code;
}
/**
 *
 * @param {*} dir：路径
 * @param {*} opts:  参数
 */
function build(dir, opts = {}) {
  // node的命令路径， watch配置
  const { cwd, watch } = opts;
  // 采用断言验证， 如果不是以/开头
  assert(dir.charAt(0) !== '/', `dir should be relative`);
  assert(cwd, `opts.cwd should be supplied`);

  // 获取对应的package.json的路径
  const pkgPath = join(cwd, dir, 'package.json');
  assert(existsSync(pkgPath), 'package.json should exists');
  // 导包
  const pkg = require(pkgPath);
  // 获取lib包
  const libDir = join(dir, 'lib');
  // 获取src包
  const srcDir = join(dir, 'src');
  // 删除对应lib包
  rimraf.sync(join(cwd, libDir));

  function createStream(src) {
    assert(typeof src === 'string', `src for createStream should be string`);
    return vfs
      .src([
        src,
        `!${join(srcDir, '**/fixtures/**/*')}`,
        `!${join(srcDir, '**/.umi/**/*')}`,
        `!${join(srcDir, '**/.umi-production/**/*')}`,
        `!${join(srcDir, '**/*.test.js')}`,
        `!${join(srcDir, '**/*.e2e.js')}`,
      ], {
        allowEmpty: true,
        base: srcDir,
      })
      .pipe(through.obj((f, env, cb) => {
        // 如果包含的是.js; .ts文件； 不包含对应的templates文件路径
        if (['.js', '.ts'].includes(extname(f.path)) && !f.path.includes(`${sep}templates${sep}`)) {
          f.contents = Buffer.from(
            transform({
              content: f.contents,
              path: f.path,
              pkg,
              root: join(cwd, dir),
            }),
          );
          f.path = f.path.replace(extname(f.path), '.js');
        }
        cb(null, f);
      }))
      .pipe(vfs.dest(libDir));
  }

  // build 建立文件流，到对应的lib目录
  const stream = createStream(join(srcDir, '**/*'));
  // 监听流是够转化结束
  stream.on('end', () => {
    pkgCount -= 1;
    if (pkgCount === 0 && process.send) {
      process.send('BUILD_COMPLETE');
    }
    // watch
    if (watch) {
      log.pending('start watch', srcDir);
      // 监听文件
      const watcher = chokidar.watch(join(cwd, srcDir), {
        ignoreInitial: true,
      });
      watcher.on('all', (event, fullPath) => {
        const relPath = fullPath.replace(join(cwd, srcDir), '');
        log.watch(`[${event}] ${join(srcDir, relPath)}`);
        if (!existsSync(fullPath)) return;
        if (statSync(fullPath).isFile()) {
          createStream(fullPath);
        }
      });
    }
  });
}
// 验证是否在lerna的包管理工具内
function isLerna(cwd) {
  return existsSync(join(cwd, 'lerna.json'));
}

// node的命令读取
const args = yParser(process.argv.slice(3));

// 检测是否开启watch监控
const watch = args.w || args.watch;

// 如果是在lerna的包管理下
if (isLerna(cwd)) {
  // 读取packages包下的文件路径个数不包含.文件
  const dirs = readdirSync(join(cwd, 'packages'))
    .filter(dir => dir.charAt(0) !== '.');
  pkgCount = dirs.length;
  dirs.forEach(pkg => {
    build(`./packages/${pkg}`, {
      cwd,
      watch,
    });
  });
} else {
  pkgCount = 1;
  build('./', {
    cwd,
    watch,
  });
}
