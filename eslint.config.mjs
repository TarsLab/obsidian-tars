import pluginJs from '@eslint/js'
import prettierConfig from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default [
	{ files: ['**/*.{js,ts}'] },
	{ ignores: ['version-bump.mjs', 'main.js'] },
	pluginJs.configs.recommended,
	...tseslint.configs.recommended,
	prettierConfig,
	{
		rules: {
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/ban-ts-comment': 'off'
		}
	}
]
