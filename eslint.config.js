export default [
  {
    files: ["**/*.js"],
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error",
      eqeqeq: "warn",
    },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        setInterval: "readonly",
        Date: "readonly",
        Map: "readonly",
        Set: "readonly",
        Array: "readonly",
        JSON: "readonly",
        Math: "readonly",
      },
    },
  },
  {
    ignores: ["node_modules/"],
  },
];
