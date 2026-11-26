// ESLint configuration — the enforceable part of docs/coding-convention.md.
//
// Every rule below is there because a section of the convention asks for it;
// the section is named next to the rule. Formatting is not ESLint's job here:
// Prettier owns layout (convention §3), and eslint-config-prettier switches off
// every ESLint rule that would disagree with it.

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Generated or third-party; not code this project writes by hand.
    ignores: ['dist/**', 'coverage/**', 'logs/**', 'spec/**', 'src/contract/openapi.json'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // The two tool configs at the root are outside tsconfig's `include`.
        projectService: {
          allowDefaultProject: ['vitest.config.ts', 'drizzle.config.ts', 'playwright.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    plugins: { jsdoc },
    rules: {
      // §4 Naming.
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'forbid' },
        // Unused parameters required by a signature (Express error handlers).
        {
          selector: 'parameter',
          modifiers: ['unused'],
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] },
        { selector: 'variable', modifiers: ['destructured'], format: null },
        { selector: 'import', format: ['camelCase', 'PascalCase'] },
        { selector: 'typeLike', format: ['PascalCase'] },
        // §4.3: no `I` prefix on interfaces.
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: { regex: '^I[A-Z]', match: false },
        },
        { selector: 'enumMember', format: ['UPPER_CASE'] },
        // §4.4: property names follow the wire, SQL or HTTP when they must, so
        // any key that needs quotes is left alone, and so are object-literal
        // keys (they mirror the contract, which is camelCase anyway).
        { selector: ['objectLiteralProperty', 'typeProperty'], format: null },
        {
          selector: ['objectLiteralProperty', 'typeProperty'],
          modifiers: ['requiresQuotes'],
          format: null,
        },
      ],

      // §5 Language rules.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      curly: ['error', 'multi-line'],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Use named exports (convention §5.3).',
        },
      ],
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      // §6 Documentation comments (TSDoc). `require-jsdoc` is a warning until
      // SMS-60 completes the documentation pass; it then becomes an error.
      'jsdoc/require-jsdoc': [
        'warn',
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            ClassDeclaration: true,
            MethodDefinition: false,
            ArrowFunctionExpression: true,
          },
          contexts: ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration', 'TSEnumDeclaration'],
        },
      ],
      'jsdoc/no-types': 'error',
      'jsdoc/check-param-names': 'error',
      'jsdoc/check-tag-names': [
        'error',
        { definedTags: ['remarks', 'typeParam', 'packageDocumentation'] },
      ],
    },
  },

  {
    // §7.4: the application logs through the logger, never the console.
    files: ['src/**/*.ts'],
    rules: { 'no-console': 'error' },
  },

  {
    // Tooling entry points whose consumer requires a default export.
    files: [
      'eslint.config.js',
      'vitest.config.ts',
      'drizzle.config.ts',
      'playwright.config.ts',
      'tests/global-setup.ts',
      'tests/ui/support/global-setup.ts',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },

  {
    // §7.1 exception: a supertest response body is `any`. A test's oracle for a
    // body is the AJV validator compiled from openapi.yaml, not a TypeScript
    // type, so typing every `res.body` would add casts that check nothing while
    // touching tests approved at TEST-GATE.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },

  {
    // Plain JavaScript scripts: not covered by tsconfig, so no type information.
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },

  prettier,
);
