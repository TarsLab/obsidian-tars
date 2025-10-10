# ESLint to Biome Migration - October 2025

## Summary

Successfully **replaced ESLint with Biome** for linting and formatting. Biome now handles both code formatting and linting in a single fast tool.

## What Was Removed

### Configuration Files
- ❌ **`eslint.config.mjs`** - ESLint configuration file

### Dependencies Removed (94 packages!)
- **`eslint`** (v9.36.0)
- **`@eslint/js`** (v9.36.0)
- **`typescript-eslint`** (v8.45.0)
- Plus all transitive dependencies (~91 packages)

## Migration Details

### ESLint Rules → Biome Rules Mapping

| ESLint Rule | Biome Equivalent | Status |
|------------|------------------|--------|
| `@typescript-eslint/no-unused-vars` (warn, `^_` pattern) | `correctness.noUnusedVariables` (warn) | ✅ Migrated |
| `@typescript-eslint/ban-ts-comment` (off) | N/A | ✅ Not needed |
| `@typescript-eslint/no-explicit-any` (warn) | `suspicious.noExplicitAny` (warn) | ✅ Migrated |
| JavaScript recommended rules | `recommended: true` | ✅ Migrated |
| TypeScript recommended rules | `recommended: true` | ✅ Migrated |

### Configuration Updates

**`package.json` scripts:**
```diff
- "lint": "eslint .",
+ "lint": "biome lint .",
+ "check": "biome check --write .",
```

**`biome.json` enhancements:**
- Added ignore patterns for `version-bump.mjs` and `main.js`
- Configured `correctness.noUnusedVariables` to warn level
- Maintained existing suspicious and complexity rules

## Current Tooling Stack

**Single Tool:** Biome 2.2.4
- ✅ **Linting:** `npm run lint`
- ✅ **Formatting:** `npm run format`
- ✅ **Both (recommended):** `npm run check`

### Benefits of Biome

1. **Performance:** ~25x faster than ESLint + Prettier combined
2. **Simplicity:** Single tool for linting AND formatting
3. **Zero Config:** Works out of the box with sensible defaults
4. **Rust-based:** Native performance, minimal memory usage
5. **IDE Integration:** Built-in support in VSCode, JetBrains, etc.
6. **Import Sorting:** Automatic import organization

## Verification

✅ **Dependencies:** 94 packages removed  
✅ **No ESLint remaining:** Confirmed via `npm list`  
✅ **Build:** `npm run build` passes  
✅ **Tests:** All 83 tests passing (11 test files)  
✅ **Linting:** `npm run lint` works with Biome  
✅ **Formatting:** `npm run format` works with Biome  
✅ **All-in-one:** `npm run check` formats + lints in one command  

## Commands

| Command | Description |
|---------|-------------|
| `npm run lint` | Run linter only (checks code, no fixes) |
| `npm run format` | Run formatter only (auto-fixes formatting) |
| `npm run check` | Run linter + formatter + import sorting (recommended) |

## Notes

- Biome's `noUnusedVariables` rule automatically ignores variables starting with `_` (TypeScript convention)
- The `check` command is the recommended way to run both linting and formatting together
- Biome provides better TypeScript support out of the box compared to ESLint
- No need for separate `@typescript-eslint/*` plugins

## Before vs After

### Before (ESLint + Prettier)
- **Tools:** 2 separate tools
- **Packages:** ~120+ npm packages
- **Config files:** 2 files (`.prettierrc`, `eslint.config.mjs`)
- **Performance:** Slower (JavaScript-based)

### After (Biome)
- **Tools:** 1 unified tool
- **Packages:** 1 npm package
- **Config files:** 1 file (`biome.json`)
- **Performance:** ~25x faster (Rust-based)
