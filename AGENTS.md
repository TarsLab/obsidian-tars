# Repository Guidelines

## Project Structure & Module Organization
- Core plugin code sits in `src/`; `main.ts` registers Obsidian entry points, while features live in `commands/`, `suggests/`, `providers/`, and `mcp/`.
- UI components reside in `modals/` and `settings/`; generated artefacts land in `dist/`, documentation in `docs/`, and worked examples in `specs/`.
- Automated suites belong in `tests/` (`tests/e2e` for long MCP flows, `tests/providers` for adapter shims); keep large fixtures outside `src/` to protect bundle size.

## Build, Test, and Development Commands
- `npm run dev` watches `esbuild.config.mjs` for fast rebuilds during local work.
- `npm run build` performs `tsc` type-checking then executes `scripts/build.sh` to refresh `dist/`.
- `npm run lint` / `npm run format` enforce Biome defaults (tabs, 120-char width, single quotes).
- `npm run test` executes Vitest; use `OLLAMA_URL=http://localhost:11434 npm run test` when E2E suites need the Ollama `llama3.2:3b` model. `npm run test:watch` and `npm run test:coverage` support watch mode and coverage reports.

## Coding Style & Naming Conventions
- Write explicit TypeScript interfaces, prefer pure helpers, and scope command IDs (e.g. `commands.registerDeepSeek`).
- Follow Biome formatting; rely on `npm run format` before committing to avoid stray whitespace or semicolons.
- Use `camelCase` for variables/functions, `PascalCase` for classes, and sync provider IDs with `manifest.json` tags.

## Testing Guidelines
- Vitest runs under `jsdom` with shared mocks from `tests/setup`; reuse them instead of recreating DOM scaffolding.
- Co-locate specs as `*.test.ts`/`*.spec.ts` near their source modules and mirror folder names.
- Target ≥85% coverage on new or modified execution paths, regenerate coverage after major changes, and guard network-backed E2E tests behind environment checks.

## Commit & Pull Request Guidelines
- Use `type(scope): summary` commit messages; reserve `wip:` for local drafts and align scopes with feature folders.
- Pull requests should link issues, explain behavioural shifts, document new settings, and attach console output or screenshots for UI changes.
- List verification steps (`npm run build`, `npm run lint`, `npm run test`) so reviewers can reproduce results quickly.

## Security & Configuration Tips
- Volta pins Node at `22.20.0`; run `volta install` or `mise use` before hacking.
- Store provider secrets in local Obsidian settings, never in the repo; document new transports in `docs/` and update `versions.json` for release tooling.
- When features depend on external services, note required environment flags in `docs/` or `specs/` to keep automation reproducible.
