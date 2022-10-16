module.exports = {
    extends: ['@webank/eslint-config-ts/vue'],
    settings: {
        'import/core-modules': ['virtual:windi.css'],
    },
    globals: {
        // 这里填入你的项目需要的全局变量
        // 这里值为 false 表示这个全局变量不允许被重新赋值，比如：
        //
        // Vue: false
    },
    rules: {
        'prettier/prettier': [
            'error',
            {
                semi: false,
            },
        ],
        'vue/object-curly-spacing': 'off',
        'vue/no-v-model-argument': 'off',
        'no-undef': 'off', // 这种事交给ts
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': 'warn',
    },
    ignorePatterns: ['src/spine/runtime/'],
}
