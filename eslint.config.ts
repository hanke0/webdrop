import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    ignores: [
      "web/dist/**",
      "dist/**",
      "dist-ssr/**",
      "release/**",
      "server.cjs",
      "server.js",
      "server/server.js",
      "server/webdrop-server.cjs",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    ignores: ["server/**"],
    plugins: { js, "@stylistic": stylistic },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.browser },
    settings: { react: { version: "detect" } },
    rules: {
      "@stylistic/brace-style": ["error", "1tbs", { allowSingleLine: true }],
    },
  },
  {
    files: ["server/**/*.ts"],
    plugins: { js, "@stylistic": stylistic },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node },
    rules: {
      "@stylistic/brace-style": ["error", "1tbs", { allowSingleLine: true }],
    },
  },
  tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  pluginReact.configs.flat["jsx-runtime"],
]);
