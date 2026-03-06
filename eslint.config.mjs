import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import globals from 'globals'

export default [
  js.configs.recommended,
  stylistic.configs.recommended,
  {
    ignores: ['build-tmp-*/**', 'lib/bindings/**', '.github/**'],
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.mocha,
      },
    },
  },
]
