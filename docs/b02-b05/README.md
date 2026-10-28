# B02–B05 implementation and evidence

This report covers the implemented and verified B02–B05 engineering slice after B01 (`575b4e1`), measured on 2026-10-28. B06–B08 are excluded. Stage 00 documentation and B01 tests are preserved. The amendments below describe operational representations without silently changing simulation requirements. The complete Stage 01 application is not yet implemented.

## Implemented scope

| Package | Implementation                                                                                                                                                                                                                                                                                                                           |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B02     | Exact Aster grid, district partition, road/connector geometry, 48 building footprints and setbacks, graph/reference validation, xoshiro128** and SplitMix64 expansion, independent jumped visual stream, fixed itineraries, reviewed nine-input hash fixture                                                                             |
| B03     | Expanded-graph Dijkstra with ASCII path tie-break, finite agents and source queues, IDM and quantized ballistic motion, physical body footprints, exclusive junction reservations and entrance holds, signal/all-red counters, atomic directional close/reopen, route repair and explicit draining exceptions, per-transition invariants |
| B04     | Actual distance/fractional vehicle-time ledger, queue/detector/window metrics, completed and unfinished demand, canonical serialization, injected SHA-256, S0/100-tick/final checkpoints, validated bounded artifacts, replay and checkpoint restore, headless execution/verification                                                    |
| B05     | Dedicated module worker, serialized commands, fixed-timestep wall scheduler and bounded batches, control acknowledgements, snapshot/metric/event publication, epochs, readonly bounded presentation buffer, explicit failure/recovery, production browser tests                                                                          |

No renderer or presentation component advances agents. The existing foundation page retains the B01 diagnostic. `SIMULATION_IMPLEMENTATION = 'contracts-only'` is retained solely for that historical probe contract; the operational APIs are `Simulation` and `RunSession`, hosted by `simulation.worker.ts`.

## Input and numerical contract

Aster contains 3 districts, 12 junctions, 17 physical road segments, 34 directed lanes, and 48 buildings. The 100/200/300-agent manifests contain 800/1600/2400 requests. These counts and input hashes are fixture metadata, not simulated outcomes. `tests/fixtures/aster-input-hashes.json` covers all nine fleet/seed combinations. `prng-vectors.json` contains independently calculated reference vectors, including seed zero; the implementation cites Blackman/Vigna's reference algorithms.

Dynamics use integer mm, mm/s, and mm/s² at boundaries, with `floor(value + 0.5)` quantization. Ballistic integration includes stopping inside a tick. Acceleration respects both physical leaders and forbidden stop lines, plus the connector approach bound. Proposals use one prior state. The non-overlap projection conservatively guards the leader's prior rear position; corrections above 1 mm and excessive emergency braking remain recorded diagnostics, required to be zero in standard scenarios.

Closure preserves the current edge and prior committed connector/outgoing lane while repairing the uncommitted suffix. Every grandfathered occupant or reservation owner receives a command-correlated `CLOSURE_DRAIN_EXCEPTION`. Busy and blocked requests remain in their finite itineraries. Source admissions occur at transition end, contributing vehicle-time from the following transition.

The compiler supports the dossier's rectangular district partition, not arbitrary GIS polygons. Signal offsets are bounded to one configured cycle and phase durations to 36,000 ticks, preventing unbounded imported initialization work. Geometry, storage, frozen reference routes, and stable request ordering are validated before execution.

## Operational format amendments

B01's shape-only v1 contracts remain intact. Operational versions are `protocol/2`, `checkpoint/2`, and `artifact/2`. Unsupported versions are rejected without implicit migration.

- Immutable city/scenario/manifest appear once. Agent slots follow the manifest. Trip rows in request order contain status, blocked reason, admitted tick, and arrival tick; `-1` means not yet admitted/arrived.
- The canonical state includes all causal mutable state: accepted future commands, signals, reservations, route/trail history, queue/retry counters, PRNG state, totals, and the 700-transition metric ring. Body footprints and trailing lane totals are derived caches rebuilt on restore.
- Checkpoints reference `[startTick,endTick]` in one authenticated metric ledger. `metricHistoryHash` validates the referenced ring; `stateHash` covers the fully materialized state. Restoring requires that history and the verified event prefix. This avoids repeatedly storing overlapping windows while retaining full restore evidence within 32 MiB.
- Metric frames store network/lane/district distance and vehicle-time, detector counts, congestion eligibility, contribution sample counts, and detector records. A detector record contains agent slot, lane index, and microseconds from transition start. District time splits use ballistic boundary times and integer residual allocation so totals reconcile.
- Regular exported metric rows are `[metricId, scope, asOfTick, windowStartTick, sampleCount, denominator, value, statistic, qualityFlags]`. End tick equals as-of tick for these series. Unit/version come from the validated definition catalog and run ID from the header. `unpackMetrics` materializes complete samples; worker observations already contain full metadata. Readings and metadata semantics are preserved.
- `acceptedAtTick` records command acceptance separately from its effective tick. Replay reproduces both, including multiple paused checkpoints at one tick. Controls, run UUID, wall timers, and performance timings do not affect state hashes.
- Exact import compatibility includes engine source SHA, engine/version, numeric contract, runtime engine/version, and platform. The SHA hashes sorted contracts/core TypeScript with LF normalization. Actual pinned browser fingerprints are reported; matching measured outcomes do not authorize arbitrary runtime upgrades or cross-runtime imports.

Import checks UTF-8 size before parsing, strict schemas/limits, input hashes, periodic checkpoints, history/event digests, command sequences, outcome evidence, and full replayed state/events/metrics. A recomputed checksum alone cannot make fabricated observations valid.

## Worker contract

The worker owns the sole browser `RunSession`. Its monotonic wall clock determines due 100 ms transitions; the core receives no wall-time delta. Batches stop at 20 ticks or 8 ms then yield. One atomic transition/checkpoint may exceed that budget; it is never split inconsistently. Lag and achieved speed are observations, and overdue ticks are retained.

Regular snapshots are eligible every two ticks with a 50 ms wall minimum; metrics every ten ticks with a 250 ms minimum. Control snapshots are immediate. Event sequences remain complete independently of visual coalescing. Compact snapshots use stable slots/edge indexes and boundary traversal records. B06 must combine them with immutable geometry and admission/arrival events for path interpolation.

Wall gaps above 500 ms pause automatically. The bridge requests PAUSE on hidden-document visibility changes. Explicit PLAY resets the wall anchor. STEP requires paused mode and acknowledges one completed tick. SUBMIT acceptance precedes its later applied event. EXPORT pauses. RESET/IMPORT advance epochs; a rejected import retains the previous core state, paused in the new epoch. Old epochs and older same-epoch snapshots cannot replace current observations.

`recover(json)` terminates the failed worker and imports a previously exported artifact into a new dedicated worker. Unsaved transitions are not recovered, and physics never migrates to the main thread. IndexedDB recovery and seek/branch UI remain later work.

## Verification and actual failures

Targeted tests cover independent acceleration/braking arithmetic, analytical 20/40-tick alternative routing, exact signals, downstream-full storage, occupied all-red clearance, committed closure/draining, disconnected demand, queue thresholds and detectors, hand-authored metric arithmetic, district reconciliation, corrupt imports, occupied checkpoint continuation, scheduler speeds, and epochs. Property tests cover 100 command sequences plus 100 generated connected small graphs, each for 1,000 transitions, with fixed fast-check seeds.

Development failures were retained and repaired:

1. Source-queued route invalidation initially skipped the first lane; the closure test exposed it. That lane is now checked before admission.
2. The first hard projection incorrectly enforced the preferred 2 m gap as a collision boundary, producing 3,778 corrections in a 300-agent run. It now enforces actual non-overlap; IDM controls preferred spacing. Diagnostics were preserved.
3. An analytical observation test assumed arrival before tick 1,000. Signal events showed two waits and arrival at 1,053; the test now observes through arrival and reconciles every contribution. Movement was not forced.
4. An early checkpoint-continuation test omitted later-accepted commands. It now supplies them at their recorded acceptance boundaries.
5. A scheduler test expected a fractional tick at 0.25x after one second. It now requires two completed ticks, consistent with the fixed-timestep contract.
6. The first multi-entry Vite build removed unused bridge exports. Explicit entry signatures preserve the production bridge, verified by browser execution.
7. Initial timing instrumentation counted metric/checkpoint work in core-tick percentiles. Core steps are now timed separately; total run time still includes all scheduled metrics/hashes. Neither cost is hidden.

8. An isolated pre-optimization run exceeded the core p95 budget (2.639 ms). Removing redundant body-index rebuilds, caching immutable profiles, stopping ordered leader scans early, and avoiding repeated contribution closures reduced cost without changing checkpoint hashes, events, or metric series. Worker views now copy only observation fields; event reads use their sequence cursor. The final 18-case matrix is explicitly compared with pre-optimization evidence by the collector.
9. Typed ESLint's legacy project loading caused the unchanged B01 boundary tests to time out while resolving deliberately forbidden imports. Package-owned project services restored fast checks without disabling typed rules. A positive `no-unsafe-assignment` test verifies that type-aware diagnostics remain enabled. Existing assertions and timeouts are unchanged.
10. The sustained-demand fixture initially assumed its queue would shrink between ticks 300 and 650. It actually grew from 4 to 10 as more vehicles reached the red gate. The test now verifies real green-phase crossings and the complete finite cohort draining; it does not assume a short-window queue improvement.
11. Lifecycle review found that a retired worker's native error could mark a replacement worker failed. Error listeners now verify worker ownership. A genuine transport failure terminates the worker, retains the last observations, rejects commands, and requires explicit recovery. Browser tests inject both current and retired-worker errors.

Large canonical artifacts remain in ignored `artifacts/local/b02-b05`. Committed machine-readable evidence: [headless results](headless-results.json), [browser comparisons](browser-results.json), [transport measurements](transport-results.json), [isolated performance](performance-results.json), and [test totals](test-results.json). `npm run evidence:b02-b05` fails for missing/stale evidence, failed gates, changed optimization outcomes, invalid closure commitments, or event/ledger reconciliation failures.

## Exact commands and outcomes

All commands use Node 24.22.1 / npm 11.19.1. No dependencies or lockfile pins changed; no force, legacy-peer-deps, or overrides were used.

| Command                                                                                                                                    | Result                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm ci`                                                                                                                                   | Exit 0; 210 packages installed, 215 audited, zero reported vulnerabilities                                                     |
| `npm run typecheck`                                                                                                                        | Exit 0; all eight configurations                                                                                               |
| `npm run lint`                                                                                                                             | Exit 0; no warnings                                                                                                            |
| `npm run test:unit -- --reporter=json --outputFile=artifacts/local/b02-b05/unit-results.json`                                              | Exit 0; 78 passed, zero failed/pending                                                                                         |
| `npm run test:properties -- --reporter=json --outputFile=artifacts/local/b02-b05/property-results.json`                                    | Exit 0; four properties, including 100 intervention cases and 100 generated graph cases, each 1,000 ticks                      |
| `npm run sim:verify -- --seeds 104729,130363,155921 --fleets 100,200,300 --ticks 9000 --out artifacts/local/b02-b05/final`                 | Exit 0; all 18 baseline/closure cases; independent repeat, import/replay, and continuation from 100/2990/3010/6010             |
| `npm run build`                                                                                                                            | Exit 0; actual dedicated module worker bundled                                                                                 |
| `npm run test:e2e -- --workers=1`                                                                                                          | Exit 0; 12 tests before the transport suite was added, including three full-length worker repeat/replay cases                  |
| `npm run test:e2e -- tests/e2e/foundation.spec.ts tests/e2e/simulation-worker.spec.ts tests/e2e/transport-performance.spec.ts --workers=1` | Exit 0; 12 final foundation, fault/recovery, and transport checks; with the three full replay cases, 15 distinct browser tests |
| `npm run test:a11y -- --workers=1`                                                                                                         | Exit 0; all three foundation axe checks, zero serious/critical findings                                                        |
| `npm run perf:headless -- --fleet 300 --ticks 9000 --out artifacts/local/b02-b05/final-performance`                                        | Exit 0; measured budgets below                                                                                                 |
| `npm run evidence:b02-b05`                                                                                                                 | Exit 0; authenticated inputs/outputs, paired manifests, conservation, closures, metrics and build freshness reconciled         |

The final formatting/preservation checks accompany the commit. The lockfile, Stage 00 dossier, B01 report, and all original B01 tests are byte-identical to `575b4e1`.

## Actual simulation outcomes

Each row uses one unchanged manifest for its paired 9,000-tick runs. All 18 runs have zero safety projections above 1 mm, zero emergency-limit violations, and zero safety diagnostics. These are model outcomes, not claims about a real city or universal intervention benefits.

| Fleet | Seed   | Baseline completed | Closure completed | Baseline unfinished | Closure unfinished |
| ----- | ------ | ------------------ | ----------------- | ------------------- | ------------------ |
| 100   | 104729 | 293                | 295               | 507                 | 505                |
| 100   | 130363 | 275                | 275               | 525                 | 525                |
| 100   | 155921 | 257                | 261               | 543                 | 539                |
| 200   | 104729 | 321                | 302               | 1279                | 1298               |
| 200   | 130363 | 310                | 318               | 1290                | 1282               |
| 200   | 155921 | 276                | 278               | 1324                | 1322               |
| 300   | 104729 | 299                | 294               | 2101                | 2106               |
| 300   | 130363 | 286                | 288               | 2114                | 2112               |
| 300   | 155921 | 256                | 250               | 2144                | 2150               |

The 300-agent baseline peaks are 281 at tick 8857, 286 at 8426, and 282 at 7988 for the three seeds, satisfying SIM-03 after tick 1200. Every closed-lane case records zero new admission/reservation commitments during ticks 3000–5999. Draining exceptions and post-reopen reservations are recorded per run. Completed counts must always be read beside unfinished requests; the exclusive junction model has intentionally low capacity.

## Performance and runtime comparison

The isolated 300-agent run on Windows 11 build 26200, Intel i5-1335U, 16 GB RAM, Balanced power scheme took **9.498 s** including scheduled metrics/checkpoints. Core tick p50/p95/p99 were **0.518 / 0.954 / 1.709 ms**. The canonical artifact was **31,711,338 bytes**: checkpoints 19,449,113; events 974,255; metric series 5,700,156; transition ledger 5,113,200; the remainder is inputs/header. The largest artifact in the matrix was 32,232,395 bytes, below 33,554,432 bytes (32 MiB).

Node retained heap after explicit collection was 89,361,176 bytes; its observed pre-collection peak was 354,859,968. These CLI measurements are distinct from application memory. Chromium's completed worker run used **44,897,796 bytes across page and worker isolates after collection**, measured with CDP. The largest JSON-encoded render snapshot was **6,280 bytes**, with at most three buffered. No main-thread-only heap value is presented as total app memory.

At 300 configured agents, with 236 actually in-network after 1200 warm-up steps, preliminary 1x command-ack p95 was 3.2 ms Chromium, 5 ms Firefox, and 17 ms WebKit (30 new commands each). Inspection transport p95 was 5.7/12/17 ms. The 4x samples achieved approximately 3.989x/3.958x/3.891x. These short transport checks do not replace the prescribed full renderer/frame interaction sampling protocol or real-GPU acceptance.

Tested binaries were Chromium 156.0.8078.4, Firefox 157.0, and Playwright WebKit 27.2, on the Windows test host. Browser identity includes the browser-declared user agent/platform: WebKit's Safari profile declares MacOS and DPR 2 despite the Windows host. This is automation coverage, not an actual Mac/Safari device claim.

All three browsers repeat and replay their own 9,000-tick closure experiment exactly. Their final state, event digest, metric series, and aligned checkpoints from tick 100 onward match Node. The S0 checkpoint has different accepted-command context: the CLI preaccepts its script before recording S0; worker INIT records S0 before separate SUBMIT messages. That mismatch is recorded explicitly and is not attributed to floating-point portability. Exact cross-runtime import remains rejected by fingerprint, even when the measured outcomes match.

## Acceptance scope

| Gates              | B02–B05 disposition                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SIM-01–13          | Passed by authored/reference fixtures, analytical dynamics/service tests, sustained finite demand, generated properties and the 18-case matrix            |
| REP-01/02/03       | Passed: Node repeat/replay and all required restore ticks; full-length repeat/replay separately in each browser; occupied-connector coverage included     |
| REP-04             | Worker/headless equal-tick speed and main-thread-stall portions passed; renderer FPS and Map comparisons belong to B06–B08                                |
| REP-05/06          | Fingerprints/comparisons reported; bounded import rejection, stale epochs, reordering, reset, failure and recovery tested; seeking remains Stage 03       |
| MET-01/02/03/05/06 | Passed: independent arithmetic, exact queue threshold, window boundaries/nulls, detector and district reconciliation; no energy/pollution readings        |
| MET-04             | Exported/worker sample metadata passed; visible simulation UI consistency awaits B07                                                                      |
| SYS-01/02/03       | Pure core, fixed worker clock, acknowledgements, visibility/gap pause, bounded snapshots and stale observation handling passed                            |
| BUILD-01           | Current scope passed: clean installation, strict checks, original tests, actual production worker load and browser execution                              |
| PERF-01/03/05/08   | Observed headless, transport, heap and snapshot budgets passed on the recorded hardware; full rendering/reference interaction evidence remains later work |

There are no unresolved implementation blockers for B06. Required rendering/UI portions remain explicit later work, not silently waived gates. The available CPU is a newer mobile i5 than the proposed reference; this report does not certify every reference device or browser version.

## Changed files

Changes are confined to: `packages/simulation/src` (city, demand, routing, dynamics, occupancy, engine, metrics, replay and module notes); operational additions in `packages/contracts/src`; the worker host/entry and web bridge; Aster JSON inputs; headless/data/evidence/runtime scripts; analytical/property/browser fixtures and tests; new evidence under `docs/b02-b05`; and `DEVELOPMENT.md`, Vite/Node tool configuration, typed ESLint project selection, and root npm scripts. No dependency pin, original B01 test, Stage 00 document, renderer, backend or container implementation changed.

## B06 handoff and remaining risks

Use `SimulationClient` as the browser boundary. Subscribe to validated observations, buffer at most three snapshots, interpolate along authoritative paths, and freeze on starvation. Selection/camera state belongs to presentation. No scene, SVG Map, camera, interpolation, cinematic effects, or user-facing simulation controls are implemented here.

Renderer-dependent REP-04/SYS-04/SYS-05, INT/FALL gates, screen-reader flows, frame/GPU budgets, the prescribed full interaction sampling protocol, and aggregate Stage 01 sign-off remain B06–B08 work. B05 measurements are preliminary wherever the acceptance table requires the full application/reference rendering setup. This report does not claim the complete Stage 01 slice or calibrated real-city predictions.

Exclusive junction ownership deliberately reduces capacity and leaves substantial unfinished demand. Completed-trip statistics can be selection-biased; future comparisons must retain backlog, unfinished counts, and matched-trip coverage. Energy/pollution remain unavailable. The 300-agent artifact is close to the 32 MiB cap, so later features must preserve that budget or introduce a reviewed format version.
