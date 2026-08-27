// Builds the development-only smoke harness (test/smoke) as a separate Obsidian
// plugin. It imports the real vendor code from src/, so it exercises exactly what
// ships — but nothing here ever enters main.js.
import esbuild from 'esbuild'
import { builtinModules } from 'node:module'
import { copyFileSync, mkdirSync } from 'node:fs'

const OUT = 'build/tars-smoke'
mkdirSync(OUT, { recursive: true })

await esbuild.build({
	entryPoints: ['test/smoke/main.ts'],
	bundle: true,
	external: ['obsidian', 'electron', ...builtinModules],
	format: 'cjs',
	target: 'es2021',
	logLevel: 'info',
	sourcemap: 'inline',
	outfile: `${OUT}/main.js`
})
copyFileSync('test/smoke/manifest.json', `${OUT}/manifest.json`)
console.log(`built -> ${OUT}`)
