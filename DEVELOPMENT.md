# CIVITAS development — Stage 01 interactive city

This checkout contains the Aster fixture, deterministic traffic core, dedicated worker, instanced React Three Fiber city, independent SVG map, simulation controls, inspectors, closures and evidence tables. Read [the B06–B08 report](docs/b06-b08/README.md) for release status, measurements and remaining gates, and [implementation architecture](docs/b06-b08/architecture.md) for presentation boundaries. The engine evidence remains in [B02–B05](docs/b02-b05/README.md).

Run the engine with the existing pinned toolchain:

```powershell
npm run sim:run -- --fleet 200 --seed 104729 --ticks 9000
npm run sim:run -- --fleet 300 --seed 104729 --ticks 9000 --closure true
npm run sim:verify -- --seeds 104729,130363,155921 --fleets 100,200,300 --ticks 9000
npm run perf:headless -- --fleet 300 --ticks 9000 --out artifacts/local/performance
```

The CLI also accepts `--city`, `--scenario`, `--manifest`, and `--commands` JSON paths, and `--out` for its output directory. Command fixtures are submitted at S0. Imported content hashes/references must agree. Artifacts and separate machine timing reports are written under ignored `artifacts/local` by default. `data:build` reproduces authored city/scenario inputs; it does not regenerate expected test hashes.

The main page is the interactive city; `/foundation` retains the B01 diagnostic and its original assertions. The operational browser boundary is `apps/web/src/bridge/simulation-client.ts`. The application validates bundled inputs, awaits worker acknowledgements and subscribes to read-only observations. Rendering never imports or advances the core. `npm run dev` and `npm run build` generate all nine validated fleet/seed inputs first; generated JSON is not source-controlled.

`npm run verify:stage01` runs formatting, strict types, lint, all unit/property tests, production build and the complete browser suite, saving evidence under `docs/b06-b08/evidence`. Full browser replay tests run 9,000 transitions twice plus import/replay and can take several minutes. Hardware performance is opt-in: in PowerShell set `$env:CIVITAS_RENDER_PERF='1'`, then run `npx playwright test tests/e2e/render-performance.spec.ts --project=chromium --workers=1`. Four runs each warm for 60 s and sample for 120 s. Run hardware samples without other benchmarks in parallel. `npm run evidence:stage01` assembles the measured status and deliberately exits nonzero while required gates remain unresolved.

The remaining notes record the original B01 foundation. Their statements about unimplemented modules describe that earlier checkpoint; current implementation details and evidence are in the linked B02–B05 report.

## Prerequisites

Use Node **24.22.1** and npm **11.19.1**, matching `.node-version`, `engines`, and `packageManager`. Select that Node version with your existing version manager or install the official release. Other versions fail installation intentionally because `engine-strict` is enabled. No global project tooling, secrets, backend, database, or container is needed.

## Run the application

```powershell
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. The experiment starts paused. Use Play, Pause, Step and Speed in the bottom strip. Select a road in City, Map or Laboratory → Explore; closing a direction is accepted for the next tick and only applies after Step or Play. Laboratory also contains metric definitions, events, validated experiment inputs, display settings and export/import/replay. Narrow screens default to Map. No runtime external service is required.

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
