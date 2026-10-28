# CIVITAS development — Stage 01 / B02–B05

This checkout contains the Aster fixture, deterministic traffic core, headless evidence tools, and dedicated simulation worker/application bridge. Read [the B02–B05 report](docs/b02-b05/README.md) for current scope, measured results, operational formats, and the B06 handoff. The original README and seven Stage 00 documents remain the reviewed design record.

Run the engine with the existing pinned toolchain:

```powershell
npm run sim:run -- --fleet 200 --seed 104729 --ticks 9000
npm run sim:run -- --fleet 300 --seed 104729 --ticks 9000 --closure true
npm run sim:verify -- --seeds 104729,130363,155921 --fleets 100,200,300 --ticks 9000
npm run perf:headless -- --fleet 300 --ticks 9000 --out artifacts/local/performance
```

The CLI also accepts `--city`, `--scenario`, `--manifest`, and `--commands` JSON paths, and `--out` for its output directory. Command fixtures are submitted at S0. Imported content hashes/references must agree. Artifacts and separate machine timing reports are written under ignored `artifacts/local` by default. `data:build` reproduces authored city/scenario inputs; it does not regenerate expected test hashes.

The foundation page remains the B01 diagnostic because B06–B08 views and controls are excluded. The operational browser entry is `apps/web/src/bridge/simulation-client.ts`: initialize `createSimulationClient(runId)` with validated inputs, expected hashes, and `client.identity`; await commands and subscribe to readonly observations. It loads the real dedicated worker. Rendering must never import or advance the core.

The existing verification commands below discover the additional tests too. Full browser replay tests run 9,000 transitions twice plus import/replay and can take several minutes; use `npm run test:e2e -- --workers=1` for predictable resource use. Full Stage 01 rendering and interaction acceptance remains B06–B08 work.

The remaining notes record the original B01 foundation. Their statements about unimplemented modules describe that earlier checkpoint; current implementation details and evidence are in the linked B02–B05 report.

## Prerequisites

Use Node **24.22.1** and npm **11.19.1**, matching `.node-version`, `engines`, and `packageManager`. Select that Node version with your existing version manager or install the official release. Other versions fail installation intentionally because `engine-strict` is enabled. No global project tooling, secrets, backend, database, or container is needed.

## Run the foundation

```powershell
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. This is a foundation page with a real module-worker transport check. It has no simulation clock, city, routing, vehicle motion, or numerical simulation readings. R3F and Three.js are pinned for later work and are not rendered in B01.

## Verify B01

```powershell
npm exec playwright install chromium firefox webkit
npm run verify:b01
npm run audit:dependencies
```

`verify:b01` checks formatting, eight isolated TypeScript configurations, linting, unit/property tests, production build, browser tests, and accessibility checks. Playwright starts and stops a production preview server on port 4173; no separate server should occupy that port. Test failure or a missing browser causes a nonzero exit. The full Stage 01 simulation/replay/performance gates are not implemented or claimed by this command.

Additional scripts:

- `npm run audit:registry`: verify all exact external manifest pins against registry metadata; writes an ignored local report. Run before resolving dependency changes.
- `npm run audit:dependencies`: inspect the complete installed peer/dependency tree with `npm ls --all`.
- `npm run format`: format new source and documentation; original Stage 00 Markdown is explicitly excluded.
- `npm run test:unit`, `npm run test:properties`, `npm run test:e2e`, and `npm run test:a11y`: run individual verification layers.

## Boundaries and extension points

- `@civitas/contracts` contains strict Zod schemas, branded IDs/units, independent version labels, and metric definition metadata. It depends only on Zod and has an ES-only compiler environment.
- `@civitas/simulation` currently exports specification constants and its `contracts-only` status. Its runtime imports are limited to contracts and its own source. Its directories document later work; there is no stub engine pretending to simulate.
- `@civitas/simulation-worker` contains only a diagnostic probe, compiled with WebWorker globals. The run command protocol is defined but has no handlers yet.
- `@civitas/web` has DOM types, React error handling, and Zustand presentation status. It cannot import the core directly. A static worker URL is the only connection to the probe entry point.
- Node tooling and browser tests have separate compiler configurations. Compile-only negative assertions prove that the pure environment has no DOM, Worker, or Node globals and that unit/ID brands cannot mix.

ESLint rejects forbidden package imports, relative escapes, re-exports, type imports, dynamic imports, `require`, and unseeded clock/random access in the pure code. Tests exercise those failures directly.

Schemas enforce structural shape, finite/safe numeric ranges, versions, bounded collections, and local relationships. Graph connectivity, foreign-key integrity, geometry continuity, manifest itinerary semantics, actual SHA-256 verification, canonical serialization, and replay remain later validation work. A syntactically valid checkpoint is not proof that it restores a run.
