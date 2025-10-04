import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	resolve: {
		alias: {
			src: path.resolve(__dirname, './src')
		}
	},
	test: {
		// Disable watch mode by default
		watch: false,
		// Set timeout for tests (10 seconds)
		testTimeout: 10000,
		// Include all test files in the tests directory
		include: ['tests/**/*.{test,spec}.ts'],
		// Environment for tests
		environment: 'jsdom',
		// Setup files if needed (can be added later)
		// setupFiles: [],
		// Coverage configuration
		coverage: {
			// Use V8 coverage provider for Node.js
			provider: 'v8',
			// Coverage reporters
			reporter: ['text', 'json', 'html'],
			// Include source files
			include: ['src/**/*.{ts,js}'],
			// Exclude test files and node_modules
			exclude: [
				'node_modules/**',
				'tests/**',
				'**/*.d.ts',
				'**/*.config.{ts,js}',
				'version-bump.mjs',
				'esbuild.config.mjs'
			],
			// Generate coverage reports in coverage/ directory
			reportsDirectory: './coverage'
		}
	}
})
