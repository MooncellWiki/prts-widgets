import js from "@eslint/js";
import pluginUnoCSS from "@unocss/eslint-plugin";
import pluginImport from "eslint-plugin-import-x";
import configPrettierRecommended from "eslint-plugin-prettier/recommended";
import pluginUnicorn from "eslint-plugin-unicorn";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";
import parserVue from "vue-eslint-parser";

export const GLOB_SRC_EXT = "?([cm])[jt]s?(x)";
export const GLOB_SRC = "**/*.?([cm])[jt]s?(x)";

export const GLOB_MARKDOWN = "**/*.md";

export const GLOB_TS = "**/*.?([cm])ts";
export const GLOB_TSX = "**/*.?([cm])tsx";

export const GLOB_VUE = "**/*.vue";

export const lintEnv = {
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    globals: {
      ...globals.browser,
      ...globals.commonjs,
      ...globals.node,
    },
  },
  linterOptions: {
    reportUnusedDisableDirectives: true,
  },
};

export const typescript = tseslint.config({
  extends: [...tseslint.configs.recommended],
  files: [GLOB_TS, GLOB_TSX],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      sourceType: "module",
    },
  },
  rules: {
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/no-explicit-any": "off",
  },
});

const vueCustomRules = {
  "vue/block-order": ["error", { order: ["script", "template", "style"] }],
  "vue/component-tags-order": [
    "error",
    {
      order: ["script", "template", "style"],
    },
  ],
  "vue/custom-event-name-casing": ["error", "camelCase"],
  "vue/eqeqeq": ["error", "smart"],
  "vue/html-self-closing": [
    "error",
    {
      html: {
        component: "always",
        normal: "always",
        void: "any",
      },
      math: "always",
      svg: "always",
    },
  ],
  "vue/max-attributes-per-line": "off",

  "vue/multi-word-component-names": "off",
  "vue/no-constant-condition": "warn",
  "vue/no-empty-pattern": "error",
  "vue/no-loss-of-precision": "error",
  "vue/no-unused-refs": "error",
  "vue/no-useless-v-bind": "error",

  "vue/no-v-html": "off",
  "vue/object-shorthand": [
    "error",
    "always",
    {
      avoidQuotes: true,
      ignoreConstructors: false,
    },
  ],
  "vue/one-component-per-file": "off",
  "vue/padding-line-between-blocks": ["error", "always"],
  "vue/prefer-template": "error",
  "vue/require-default-prop": "off",
  "vue/require-prop-types": "off",
};

const vue3Rules = {
  ...pluginVue.configs.base.rules,
  ...pluginVue.configs["vue3-essential"].rules,
  ...pluginVue.configs["vue3-strongly-recommended"].rules,
  ...pluginVue.configs["vue3-recommended"].rules,
};

export const vue = [
  ...tseslint.config({
    extends: typescript,
    files: [GLOB_VUE],
  }),
  {
    files: [GLOB_VUE],
    languageOptions: {
      parser: parserVue,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        extraFileExtensions: [".vue"],
        parser: tseslint.parser,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      vue: pluginVue,
    },
    processor: pluginVue.processors[".vue"],
    rules: {
      ...vue3Rules,
      ...vueCustomRules,
    },
  },
];

export const imports = {
  plugins: {
    import: pluginImport,
  },
  rules: {
    "import/no-named-as-default": "off",
    "import/order": [
      "error",
      {
        groups: [
          "builtin",
          "external",
          "internal",
          "parent",
          "sibling",
          "index",
          "object",
          "type",
        ],
        pathGroups: [
          { group: "builtin", pattern: "vue", position: "before" },
          { group: "internal", pattern: "{{@,~}/,#}**" },
        ],
        pathGroupsExcludedImportTypes: [],
        "newlines-between": "always",
        alphabetize: {
          order: "asc",
        },
      },
    ],
  },
};

export const prettier = [
  configPrettierRecommended,
  {
    rules: {
      "prettier/prettier": "warn",
    },
  },
];

export const unicorn = [
  pluginUnicorn.configs["flat/recommended"],
  {
    rules: {
      "unicorn/filename-case": "off",
      "unicorn/prevent-abbreviations": "off",
      "unicorn/no-null": "off",
      "unicorn/prefer-top-level-await": "off",
      "unicorn/prefer-spread": "off",
      "unicorn/no-array-reduce": "warn",
      "unicorn/number-literal-case": "off",
      "unicorn/no-array-for-each": "warn",
    },
  },
];

export const ignores = {
  ignores: ["**/spine/runtime", "**/.husky", "**/dist"],
};

export const unocss = {
  name: "unocss",
  plugins: {
    unocss: pluginUnoCSS,
  },
  rules: {
    "unocss/order": "warn",
    "unocss/blocklist": "error",
  },
};

export default [
  lintEnv,
  js.configs.recommended,
  ...typescript,
  ...vue,
  imports,
  ...prettier,
  ...unicorn,
  ignores,
  unocss,
];
