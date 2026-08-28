import pluginJs from '@eslint/js'
import prettierConfig from 'eslint-config-prettier'
import obsidianmd from 'eslint-plugin-obsidianmd'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
	{ ignores: ['version-bump.mjs', 'esbuild.config.mjs', 'esbuild.smoke.mjs', 'eslint.config.mjs', 'vitest.config.mts', 'main.js', 'build/**'] },
	pluginJs.configs.recommended,
	...tseslint.configs.recommended,
	...obsidianmd.configs.recommended,
	prettierConfig,
	{
		// Same call as above, on the manifest side: axios stays, so the
		// "replace it with fetch" advice does not apply here.
		files: ['**/package.json'],
		rules: { 'depend/ban-dependencies': 'off' }
	},
	{
		// The obsidianmd ruleset is advice for code running inside the app. The unit
		// tests run in Node against a stubbed `obsidian`, where a hand-made TFile is
		// a fixture, not a cast that could be wrong at runtime.
		files: ['test/unit/**/*.ts'],
		rules: { 'obsidianmd/no-tfile-tfolder-cast': 'off' }
	},
	{
		// obsidianmd also lints manifest.json/package.json; the type-aware rules
		// below only make sense on TypeScript sources.
		files: ['**/*.ts'],
		languageOptions: {
			// Desktop Obsidian is Electron, so both sets of globals are in play.
			globals: { ...globals.browser, ...globals.node },
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: {
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/ban-ts-comment': 'off',

			// The guidelines want Obsidian's requestUrl instead of axios/fetch, but
			// requestUrl only ever resolves to a buffered body (arrayBuffer/json/text).
			// Every provider here streams tokens as they arrive via
			// `responseType: 'stream'`, so requestUrl cannot replace them.
			'@typescript-eslint/no-restricted-imports': 'off',
			'no-restricted-globals': 'off',

			// Type-safety debt, almost entirely in the axios-backed providers whose
			// responses are typed `any`. Tracked as warnings so it stays visible
			// without blocking the build; fixing it means typing those responses.
			'@typescript-eslint/await-thenable': 'warn',
			'@typescript-eslint/no-floating-promises': 'warn',
			'@typescript-eslint/no-misused-promises': 'warn',
			'@typescript-eslint/no-unnecessary-type-assertion': 'warn',
			'@typescript-eslint/no-unsafe-argument': 'warn',
			'@typescript-eslint/no-unsafe-assignment': 'warn',
			'@typescript-eslint/no-unsafe-call': 'warn',
			'@typescript-eslint/no-unsafe-member-access': 'warn',
			'@typescript-eslint/no-unsafe-return': 'warn'
		}
	}
)
