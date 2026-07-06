import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  {
    ignores: [
      'dist/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      'server/',
      'backup/',
      'backups/',
      'deploy/',
      'design_handoff_dungeon_scribe/',
      'design_handoff_hex_map/',
      'public/',
      'screenshots/',
      'supabase/',
    ],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'vue/no-unused-vars': ['error', { ignorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.test.js', 'test/**', 'e2e/**', 'scripts/**', '*.config.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
]
