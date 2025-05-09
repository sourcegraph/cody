# Cody Guide

## Build/Test Commands
- Build: `pnpm build` (root) or `pnpm -C vscode run build` (vscode dir)
- Lint: `pnpm run check` or `pnpm biome` (catches build errors early)
- Format: `pnpm format` (uses Biome)
- Run tests:
  - Unit tests: `pnpm test:unit` or `vitest [test-file-path]` (single test)
  - Integration tests: `pnpm -C vscode run test:integration`
  - E2E tests: `pnpm -C vscode run test:e2e` or `pnpm -C vscode test:e2e:run [test-file]:[line]`

## Code Style Guidelines
- Indentation: 4 spaces (2 spaces for JSON)
- Quotes: Single quotes with semicolons as needed
- Line width: 105 characters
- Type safety: Avoid `as` casts outside of tests (use `satisfies` where needed)
- Imports: Use named exports, organize imports with Biome
- Documentation: Use `/**` JSDoc comments for API methods
- Async patterns:
  - Promises for single async results
  - Observables for values that change over time
  - Use generators for demand-driven multiple values
- Follow telemetry naming convention: `cody.<feature>` for feature parameter
- Telemetry: Use numeric values for exportable metadata, protect sensitive data
- Error handling: Prefer type-safe error handling patterns
