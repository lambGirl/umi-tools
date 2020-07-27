/**
 * 采用rollup打包
 */

// node命令转化成对象， 将str转化成对象获取
const yParser = require('yargs-parser');

// 引入rollup打包
const rollup = require('rollup');
// node的断言库
const assert = require('assert');
// 对文件的操作
const { existsSync, readdirSync } = require('fs');
// 对路径的操作
const { join } = require('path');

// 一个Rollup插件，它使用Node解析算法定位模块，在node_modules中找到并捆绑第三方依赖项
const nodeResolve = require('rollup-plugin-node-resolve');

// 一个Rollup插件，用于将CommonJS模块转换为ES6，因此它们可以包含在Rollup捆绑包中
const commonjs = require('rollup-plugin-commonjs');
// 一个Rollup插件，可在捆绑时替换文件中的字符串。
const replace = require('rollup-plugin-replace');
//  Rollup和PostCSS之间的无缝集成。
const postcss = require('rollup-plugin-postcss');
//  日志配置
const log = require('./utils/log');
// 数据parse化
const parseGlobals = require('./utils/parseGlobals');

// node的环境变量
const env = process.env.NODE_ENV;

// 验证是否以lerna管理仓库
function isLerna(cwd) {
  return existsSync(join(cwd, 'lerna.json'));
}


/**
 * 构建操作
 * @param {*} dir: 需要打包项目的路径
 * @param {*} opts: 执行命令的参数
 */
function build(dir, opts = {}) {
  const { cwd, watch, globals = {} } = opts;
  // 对应的断言
  assert(dir.charAt(0) !== '/', `dir should be relative`);
  assert(cwd, `opts.cwd should be supplied`);

  // 获取对应的package.json对应的路径
  const pkgPath = join(cwd, dir, 'package.json');
  assert(existsSync(pkgPath), 'package.json should exists');

  /**
   * rollup.config.js 输入配置
   * external: 不需要打进项目中的包
   * 依赖的plugins： 采用插件的方式调用外部包去调用对应的工具库
   */
  const inputOptions = {
    external: [
      'react',
      'react-dom',
      ...Object.keys(globals),
    ],
    plugins: [
      // 一个Rollup插件，它使用Node解析算法定位模块，以便在node_modules中使用第三方模块
      nodeResolve({
        jsnext: true,
      }),
      // 打包到前端的环境变量
      replace({
        'process.env.NODE_ENV': JSON.stringify(env),
      }),
      // cjs编译
      commonjs(),
      // 与postcss结合
      postcss({
        extract: true
      }),
    ],
  };

  // 输出配置
  /**
   * format: 'umd', 打包成min可以在浏览器端直接通过浏览器访问的文件
   * globals： 定义全局会引用的库，由于我们在extends排除不打包到对应的代码中（指出应将哪些模块视为外部模块）
   * extend：如果它被视为外部引用（externals）则返回 true
   */
  const outputOptions = {
    format: 'umd',
    extend: true,
    // 定义全局会引用的库，由于我们在
    globals: {
      'react': 'React',
      'react-dom': 'ReactDOM',
      ...globals,
    },
  };

  // package.json对应的路径
  const pkg = require(pkgPath);
  // 获取对应的umiTools配置
  const { rollupFiles = [] } = pkg.umiTools || {};

  //  自动执行打包
  (async () => {
    // 循环执行打包
    for (let rollupFile of rollupFiles) {
      const [ file, opts = {} ] = rollupFile;
      log.info(`build ${file}`);
      // 将对应的打包文件的入口
      const input = {
        ...inputOptions,
        input: join(dir, file),
      };
      const output = {
        ...outputOptions,
        file: join(dir, file.replace(/\.js$/, '.umd.js')),
        name: opts.name,
      };

      // 采用rollup的watch方式
      if (watch) {
        const watcher = rollup.watch({
          ...input,
          output,
        });
        watcher.on('event', event => {
          log.info(`watch ${event.code}`);
        });
      } else {
        const bundle = await rollup.rollup(input);
        // 将最终的文件输出到对应的路径下
        await bundle.write(output);
      }
    }
  })();
}

// Init cwd是指当前node命令执行时所在的文件夹目录；
const cwd = process.cwd();
// 获取node的命令，将命令转化成obj对象
const args = yParser(process.argv.slice(3));
// 监听
const watch = args.w || args.watch;

// 将对应的命令转化成对应的json
const globals = parseGlobals(args.g || args.globals || '');

// 在lerna的管理下，就采用lerna的打包方式，依次将对应的包执行打包操作
if (isLerna(cwd)) {
  const dirs = readdirSync(join(cwd, 'packages'));
  dirs.forEach(pkg => {
    if (pkg.charAt(0) === '.') return;
    build(`./packages/${pkg}`, {
      cwd,
      watch,
      globals,
    });
  });
} else {
  build('./', {
    cwd,
    watch,
    globals,
  });
}
