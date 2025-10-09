# Repository Guidelines

## Project Structure & Module Organization
Core plugin code lives in `src/`; `main.ts` registers the Obsidian entry points, while `commands/`, `suggests/`, `providers/`, and `mcp/` house feature modules. UI helpers sit in `modals/` and `settings/`. Build artefacts are written to `dist/`, documentation to `docs/`, worked examples to `specs/`, and automated suites to `tests/` (`tests/e2e` for long-running flows, `tests/providers` for adapter shims). Keep bulky fixtures outside `src/` to preserve bundle size.

## Build, Test, and Development Commands
- `npm run dev`: runs `esbuild.config.mjs` in watch mode for local hacking.
- `npm run build`: type-checks with `tsc` then executes `scripts/build.sh` to refresh `dist/`.
- `npm run lint` / `npm run format`: apply Biome linting and formatting; run before pushing.
- `npm run test`: executes Vitest once; `npm run test:watch` keeps the UI open.
- `npm run test:coverage`: emits coverage reports to `coverage/`; ensure regressions are justified.

## Coding Style & Naming Conventions
Biome enforces tabs, a 120-character line width, single quotes, and minimal semicolons. Write TypeScript with explicit interfaces, prefer pure helpers over stateful singletons, and keep Obsidian command IDs scoped to their feature area (e.g. `commands.registerDeepSeek`). Use `camelCase` for variables and functions, `PascalCase` for classes, and align provider IDs with tag names in `manifest.json`.

## Testing Guidelines
Vitest runs under `jsdom` using shared mocks from `tests/setup`. Co-locate specs as `*.test.ts` or `*.spec.ts` under the matching domain folder. Reuse the global Obsidian mocks instead of recreating DOM scaffolding. E2E MCP scenarios in `tests/e2e` sometimes need Docker-backed services; guard live integrations behind environment checks and document prerequisites in the test header. Regenerate coverage after touching execution-critical paths.

## Commit & Pull Request Guidelines
Follow the existing `type(scope): summary` convention (e.g. `perf(mcp): reduce boot time`); reserve `wip:` commits for local drafts only. Each PR should link issues, describe behavioural shifts, call out new settings, and attach console output or screenshots for UI changes. List the verification you ran (`npm run build`, `npm run test`) to keep reviewers unblocked.

## Configuration & Environment Notes
Volta fixes Node at `22.20.0`; install via `volta install` or `mise use`. Keep provider secrets in Obsidian’s local settings, not the repo. When adding transports or providers, document required environment variables in `docs/` and update `versions.json` so release tooling tracks the change.
