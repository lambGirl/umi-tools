
// 将字符串数据以，分割组装成json数据
module.exports = function(globals) {
  return globals
    .split(',')
    .map(g => g.trim())
    .filter(g => g)
    .reduce((memo, g) => {
      const [key, value] = g.split(':');
      memo[key] = value;
      return memo;
    }, {});
}
