# B01 — implementation and verification report

Verified on 2026-10-28. Scope: Stage 01 work package **B01 only**. The final `npm run verify:b01` command exited **0**. B02 has not started; Stage 01 as a whole is not complete.

## Delivered

- Four npm workspaces with one integrity-locked dependency tree: web, contracts, simulation, and simulation-worker.
- Exact Node/npm pins, strict peer resolution, exact dependency pins, formatting, typed linting, and eight separately checked TypeScript environments.
- Strict Zod city/scenario/manifest, command/observation, checkpoint/artifact, metric, and diagnostic schemas. IDs and physical units use distinct brands; snapshots have deeply readonly public types.
- Independent schema/protocol/numeric/metric versions; fixed 100 ms timestep metadata; finite safe numeric limits and bounded import collections.
- Enforced source import boundaries, including type queries, relative escapes, dynamic imports, and re-exports. Core code cannot import UI/Node libraries or use ambient DOM/Worker/Node globals, clocks, or unseeded randomness.
- A minimal semantic React page, error boundary, and Zustand presentation status. A separate module worker validates a diagnostic request, imports the headless core constants, and returns a validated correlated response. It creates no run, timer-driven engine, or mutable traffic state.
- Vitest unit/property infrastructure and Playwright production-preview checks in Chromium, Firefox, and WebKit, plus axe checks.
- Reserved package directories and a documented B02 handoff, without city data, PRNG generation, routing, physics, rendering, AI, or backend implementation.

See [the complete changed-file inventory](changed-files.txt) and [development instructions](../../DEVELOPMENT.md). The original README remains the Stage 00 snapshot; DEVELOPMENT.md is the current development entry point.

## Dependency verification and decisions

[Registry evidence](dependencies.registry.json) records all **25** exact external manifest pins, their official registry URLs, integrity values, engine ranges, peer ranges, and optional-peer declarations. Availability and declared peer ranges were checked before installation. `npm install --package-lock-only --ignore-scripts` then resolved the full tree with the committed `strict-peer-deps=true` setting before any packages were extracted. `npm ls --all` subsequently confirmed the installed tree without invalid peers.

**No proposed package pin was changed.** No `force`, `legacy-peer-deps`, dependency overrides, mobile/Expo stack, extra component library, or paid API was used. Optional peers not required by the selected configuration were left absent.

The host initially had Node 24.20.0/npm 11.19.0. Verification used the dossier's exact **Node 24.22.1/npm 11.19.1** from an official portable Windows x64 distribution, without changing the global installation. Archive SHA-256 was checked against the release's official checksum list:

```text
node-v24.22.1-win-x64.zip
d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5
```

In this workspace's PowerShell session the toolchain was selected before commands using:

```powershell
$env:PATH = (Join-Path ([IO.Path]::GetTempPath()) 'civitas-b01-toolchain/node-v24.22.1-win-x64') + ';' + $env:PATH
```

This temporary location is machine-specific. A fresh checkout should select/install the pinned Node version normally, then run the commands in DEVELOPMENT.md. `.npmrc` intentionally rejects unsupported toolchain versions.

The first `npm ci` reported a blocked esbuild install script under npm's current lifecycle policy. After inspecting the installed script, `npm install-scripts approve esbuild` recorded only `esbuild@0.28.2` in `allowScripts`. The subsequent clean `npm ci` passed without that warning. This is a pinned build-tool script decision, not a peer override or package-version amendment. npm reported 210 packages added, 215 audited, and zero known vulnerabilities at verification time; that audit is a point-in-time observation.

## Commands and actual results

All commands below ran from the repository root under the pinned toolchain. The aggregate verification ran them sequentially and propagated a failure exit code. Browser tests used the production build through `vite preview`, not the dev server.

| Exact command                                                                                                                                                                                         | Exit | Observed result                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------- |
| `node scripts/audit-registry.mjs docs/b01/dependencies.registry.json`                                                                                                                                 | 0    | All 25 exact pins available; engine/peer/integrity metadata saved                               |
| `npm install --package-lock-only --ignore-scripts`                                                                                                                                                    | 0    | Strict full-tree peer resolution succeeded before extraction                                    |
| `npm install-scripts approve esbuild`                                                                                                                                                                 | 0    | Reviewed esbuild 0.28.2 lifecycle script pinned in policy                                       |
| `npm ci`                                                                                                                                                                                              | 0    | Clean lockfile installation succeeded, no invalid peer override                                 |
| `npm ls --all --json`                                                                                                                                                                                 | 0    | Complete installed dependency tree valid                                                        |
| `npm exec playwright install chromium firefox webkit`                                                                                                                                                 | 0    | Required browser binaries available                                                             |
| `npm run format:check`                                                                                                                                                                                | 0    | All matched new files conform to Prettier; reviewed Stage 00 Markdown excluded                  |
| `npm run typecheck`                                                                                                                                                                                   | 0    | All eight projects passed; compile-negative brand/platform/readonly assertions passed           |
| `npm run lint`                                                                                                                                                                                        | 0    | Zero errors and zero warnings                                                                   |
| `npm run test:unit`                                                                                                                                                                                   | 0    | **42 tests passed** across two files                                                            |
| `npm run test:properties`                                                                                                                                                                             | 0    | **2 tests passed**, 100 generated cases each, fixed recorded seeds                              |
| `npm run build`                                                                                                                                                                                       | 0    | Production app and separate hashed module-worker JavaScript emitted                             |
| `npm run test:e2e`                                                                                                                                                                                    | 0    | **6 tests passed**: worker success and unsupported-worker behavior in three browsers            |
| `npm run test:a11y`                                                                                                                                                                                   | 0    | **3 tests passed**: no serious/critical axe violations in the foundation view in three browsers |
| `npm run verify:b01`                                                                                                                                                                                  | 0    | Complete final check chain passed                                                               |
| `git diff --exit-code da5f9bc -- README.md docs/vision.md docs/architecture.md docs/simulation-spec.md docs/design-system.md docs/roadmap.md docs/acceptance-criteria.md docs/stage-01-build-plan.md` | 0    | Original Stage 00 documents unchanged                                                           |

The independent headless import command also passed:

```powershell
node --import tsx --input-type=module -e "import { SIMULATION_IMPLEMENTATION } from '@civitas/simulation'; if (typeof document !== 'undefined' || typeof Worker !== 'undefined') throw new Error('Unexpected platform globals'); console.log('Headless core import:', SIMULATION_IMPLEMENTATION);"
```

Output: `Headless core import: contracts-only`.

The property tests check schema transport/epoch properties, not the later SIM safety properties involving 1,000 simulation ticks. The browser checks prove transport compatibility, not cross-runtime traffic determinism. Application page-error capture and external-network-request capture were empty in the successful production flow.

Production build output at this verification: main JavaScript 327.77 kB (100.56 kB gzip), diagnostic worker 110.20 kB, CSS 0.49 kB, and HTML 0.49 kB, using Vite's reported decimal units. These are build artifact sizes, not a simulation performance benchmark. Test-runner terminals emitted an inherited `NO_COLOR`/`FORCE_COLOR` environment warning; application console/page-error checks were clear.

## Verification flow and review

Story: browser loads the foundation → bridge creates the emitted module worker → worker validates the diagnostic request → the pure core supplies specification constants → worker validates its reply → bridge validates correlation and updates presentation status.

| Boundary                   | Evidence                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------- |
| React shell renders        | Accessible CIVITAS heading asserted in all three browsers                             |
| Production worker loads    | Worker URL asserted to be a built `/assets/probe.worker-*.js` module                  |
| Request/response contracts | Runtime parse on both sides and matching request ID                                   |
| Core remains headless      | Node import and isolated ES-only compiler checks                                      |
| Response reaches UI        | Real reply changes status to `Local worker connection verified.`                      |
| Unsupported Worker         | Explicit unavailable status, with no simulated running state                          |
| Network/backend            | No external runtime request; API/database/environment credentials are not part of B01 |

React review confirmed small components, stable narrow Zustand selectors, effect cleanup that terminates workers and clears timeout handlers, error handling, semantic status announcements, and no render-driven simulation state. No cinematic effects, component framework, remote font, or large rendering import is activated.

Issues caught and resolved before the final passing run:

1. Identifier character validation alone allowed URL-shaped IDs. Added explicit external-URL rejection and retained its negative test.
2. Typed ESLint's initial project load exceeded an individual test's default timeout. Moved that setup into a bounded `beforeAll`; individual boundary assertions keep their default timeout.
3. An intentional compile-error fixture also triggered unsafe-call lint. Rewrote it as a readonly-length assignment, preserving the negative type assertion without weakening lint rules.
4. Review found the current parser represents `TSImportType` through `source`, not the older `argument` field. Corrected the boundary rule and added tests for type queries, type-only imports, and template dynamic imports.

## Acceptance scope and remaining work

**B01 is complete.** Its required BUILD-01 foundation subset passes: clean installation, strict typechecking, linting, unit/property tests, browser tests, and a production module-worker load. SYS-01 is established for the current contracts-only core through package boundaries, compiler isolation, and headless execution. There is no mutable simulation state whose worker ownership can yet be tested; that behavior remains a B03/B05 requirement. No full Stage 01 or MVP acceptance claim is made.

No unresolved problem blocks B01. The following are intentional later work, not passed behavior:

- B02: actual Aster inputs, topology/foreign-key/geometry validation, PRNG reference vectors, demand generation, and itinerary/manifest semantics.
- B03: routing, vehicle dynamics, reservation safety, signal execution, interventions, and conservation over ticks.
- B04: actual SHA-256 verification, canonical serialization, complete behavioral checkpoint restoration, event reduction, metric calculation, and bounded file import/export.
- B05 onward: simulation scheduler, interpolation, 3D/Map inspection, controls, replay/comparison, full accessibility and performance gates.

Schemas currently establish structural boundaries and local consistency. Shape fixtures deliberately do not claim a connected graph or authentic hashes. Checkpoint state categories are specified, but behavioral restore completeness still needs the B03/B04 state implementation and conformance tests. Missing energy/pollution outputs cannot carry a number.

## B02 readiness

B02 can start from the committed contracts and workspace without additional infrastructure. Use `data/aster/` for versioned authored inputs and the reserved `simulation/src/city` and `simulation/src/demand` modules. Keep generated city/demand validation separate from rendering. Implement the dossier's seed expansion and xoshiro128** reference behavior before generating manifests; publish actual input hashes and validation reports. Add cross-entity/topology and itinerary tests rather than treating successful Zod shape validation as a valid city. Do not start routing execution, traffic physics, or the worker scheduler as part of B02.
