// process.env.ESLINT_TSCONFIG = 'tsconfig.json'

module.exports = {
  extends: ['@antfu'],
  settings: {
    // 'import/core-modules': ['virtual:windi.css'],
    // 'import/resolver': {
    //   alias: {
    //     map: [['@', './src']],
    //     extensions: ['.ts', '.js', '.json'],
    //   },
    // },
  },
  globals: {
    // 这里填入你的项目需要的全局变量
    // 这里值为 false 表示这个全局变量不允许被重新赋值，比如：
    //
    // Vue: false
  },
  rules: {
    'no-console': 'warn',
  },
  ignorePatterns: ['src/spine/runtime/'],
}
