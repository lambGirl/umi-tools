#!/usr/bin/env node

//   Signale 的核心是可扩展和可配置的，可将其用于日志记录、状态报告以及处理其他 Node 模块和应用的输出渲染方式。
const signale = require('signale');
// 将node控制台命令转化成对应的obj
const yParser = require('yargs-parser');

// 获取参数对象
/**
 * process.argv: 第一个值，node的执行路径； 第2个值： 执行的文件路径；  (第三个值是传入的命令)
 */
const args = yParser(process.argv.slice(2));

if (args.v || args.version) {
  console.log(require('./package').version);
  process.exit(0);
}

// 根据命令执行对应的操作
switch (args._[0]) {
  // 项目编译
  case 'build':
  // 项目测试
  case 'test':

  // 项目打包
  case 'rollup':
    require(`./src/${args._}`);
    break;
  // 如果不知道，则报错
  default:
    signale.error(`Unknown command ${args._}`);
    break;
}
