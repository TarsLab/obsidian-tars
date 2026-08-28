import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * `obsidian` is an external at build time — the app provides it — so nothing
 * under `src/` can be imported in Node without something answering for it.
 * `src/...` is the second alias because the plugin's own files import each
 * other through the tsconfig `baseUrl` rather than by relative path.
 */
export default defineConfig({
	resolve: {
		alias: [
			{ find: /^obsidian$/, replacement: resolve(import.meta.dirname, 'test/unit/obsidian-stub.ts') },
			{ find: /^src\//, replacement: resolve(import.meta.dirname, 'src') + '/' }
		]
	},
	test: {
		include: ['test/unit/**/*.test.ts'],
		environment: 'node'
	}
})
