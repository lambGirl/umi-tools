// 可将其用于日志记录、状态报告以及处理其他 Node 模块和应用的输出渲染方式。
const { Signale } = require('signale');

/**
 * 将不同的类型输入不同的样式
 */
module.exports = new Signale({
  types: {
    transform: {
      badge: '🎅',
      color: 'blue',
      label: 'transform',
    },
    pending: {
      badge: '++',
      color: 'magenta',
      label: 'pending'
    },
    watch: {
      badge: '**',
      color: 'yellow',
      label: 'watch'
    },
  }
});
