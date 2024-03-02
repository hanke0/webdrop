module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:react/recommended',
  ],
  ignorePatterns: [
    '/.git',
    '/.github',
  ],
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
    'react',
    'react-refresh',
    'react-hooks',
    'import',
    'unused-imports',
  ],
  rules: {
    'react/jsx-uses-react': 'error',
    'react/jsx-uses-vars': 'error',
    'react/react-in-jsx-scope': 'off',
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    'import/order': [
      'error',
      {
        groups: [
          'index',
          'sibling',
          'parent',
          'internal',
          'external',
          'builtin',
          'object',
          'type',
        ],
      },
    ],
    indent: ['error', 2, { SwitchCase: 1 }],
    'max-len': ['error', {
      code: 100,
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
      ignoreRegExpLiterals: true,
      ignorePattern: 'd="([\\s\\S]*?)"' // ignore svg data
    }],
    'react/jsx-closing-bracket-location': ['error', 'line-aligned'],
    'react/jsx-closing-tag-location': 'error',
    'react/jsx-tag-spacing': 'error',
    'react/jsx-curly-spacing': ['error', 'never'],
    'jsx-quotes': ['error', 'prefer-double'],
    'no-multi-spaces': 'error',
    'react/jsx-tag-spacing': 'error',
    'react/jsx-boolean-value': 'error',
    'react/jsx-wrap-multilines': 'error',
    'react/self-closing-comp': 'error',
    'no-param-reassign': 'error',
    'import/newline-after-import': 'error',
    'import/no-absolute-path': 'error',
    'no-duplicate-imports': 'error',
    'unused-imports/no-unused-imports': "error",
  },
  "settings": {
    "react": {
      "version": "detect"
    }
  }
}
