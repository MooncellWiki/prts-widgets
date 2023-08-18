module.exports = {
  extends: [
    "stylelint-config-standard",
    "stylelint-prettier/recommended",
  ],
  overrides: [
    {
      files: ["*.module.css"],
      rules: {
        "selector-class-pattern": [
          "^[a-z][a-zA-Z0-9]+$",
          {
            message: (selector) =>
              `Expected class selector "${selector}" to be lowerCamelCase`,
          },
        ],
      },
    },
  ],
};
