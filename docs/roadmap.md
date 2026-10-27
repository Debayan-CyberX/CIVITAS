# CIVITAS — roadmap and risks

Status: Stage 00. Stages are dependency-ordered gates, not promised calendar dates. No implementation stage has started.

## Stage 00 — dossier and decisions

Deliver the seven linked design documents, initialize an appropriate repository, and verify internal consistency. Resolve simulation authority, numeric/replay limits, city scope, metric definitions, visual direction, accessibility, fallbacks, and acceptance methods before code is written.

Exit: the [Stage 01 plan](stage-01-build-plan.md) identifies bounded tasks, exact proposed dependencies, fixtures, and verification commands. No scaffolding, package installation, application implementation, deployment, or benchmark claims occur in this stage.

Stage 00 workspace review on 2026-10-28: the directory was empty, with no inherited `AGENTS.md` or existing Git repository. Git was initialized on `main`. The seven requested documents, README index, and `.gitignore` were created. Document checks validated 18 local links, including 5 section anchors, balanced fenced blocks, and references to all 59 defined acceptance criteria without unresolved IDs. The workspace contains no application source, package manifest/lockfile, or container configuration. These are documentation checks; simulation, performance, accessibility, and dependency-installation gates remain unexecuted.

## Stage 01 — deterministic mobility slice

Build the pure TypeScript core, the Aster fixture, a headless runner, versioned commands/artifacts, a worker host, and a minimal React/R3F scene with an independent 2D map and semantic controls. Demonstrate 100/200/300-agent configurations, signal queues, closure/reopening, real metrics, and reproducible reset-and-replay.

The slice has functional simple building massing and a bounded camera. It does not yet have the finished architectural art, advanced rendering effects, comparison dashboard, or interactive seek UI. Internal checkpoint restore tests are required to avoid postponing replay design errors.

Exit: all Stage 01 gates in [acceptance criteria](acceptance-criteria.md) pass, with actual run artifacts and a dependency lockfile. Document observed model diagnostics, performance, and cross-runtime compatibility. A fixture that only animates vehicles cannot pass.

## Stage 02 — cinematic city and interaction refinement

Develop the authored massing, street details, material families, lighting, atmosphere approximation, editorial typography, and final camera transitions. Refine entity picking, route explanation, intervention patterns, responsive panels, and explicit quality presets. Add no traffic authority to scene code.

Exit: full visual/interaction gates and hardware performance budgets pass. The same input and command log produces the same authoritative hashes with Standard, Reduced, Map, and headless runs. Real-device checks confirm that performance degradation preserves information and controls.

## Stage 03 — complete browser MVP and evidence workflow

Add interactive checkpoint seek, branching, baseline/experiment comparison, matched-trip coverage, full artifact recovery, and optional bounded IndexedDB persistence. Complete keyboard, screen-reader, narrow-layout, forced-colors, and reduced-motion verification. Exercise multi-seed experiments and long sessions.

Exit: every full-MVP acceptance gate passes. Exported runs carry actual evidence, version identities, and limitations. Energy and pollution remain unavailable. This cumulative release is the MVP described in [vision](vision.md); Stage 01 alone is not that release.

## Stage 04 — optional durable infrastructure

Only after authorization and a demonstrated need, add FastAPI and native PostgreSQL/PostGIS for city/scenario catalogs and durable run artifacts. Add migrations, API schemas, authentication, quotas, backups, and idempotent uploads. Preserve a fully functional free local workflow and the TypeScript core as the single traffic implementation.

Exit: API round trips preserve input/event/checkpoint hashes, spatial frame handling is explicit, recovery is tested, and offline browser experiments still run. No Docker is introduced.

## Research tracks — separate hypotheses and validation gates

| Track | Question | Evidence required before claiming a feature |
| --- | --- | --- |
| Real-city integration | Can surveyed topology and observations establish a meaningful twin? | Licensed source provenance, projected CRS, topology audit, calibration and held-out validation |
| Traffic fidelity | What changes with parallel signal movements, lane changes, mixed fleets, and driver heterogeneity? | Conflict model, safety tests, capacity studies, comparison to observed/reference behavior |
| Multimodal mobility | How do walking, cycling, transit, and freight interact with roads? | Separate demand and service models, route/priority semantics, validated coupling |
| Energy | Can building and fleet demand be estimated with credible units and uncertainty? | Sourced coefficients, schedules, conservation checks, sensitivity and validation |
| Pollution | What are source mass and ambient exposure under specific conditions? | Emission factors, weather, dispersion model, mass balance, uncertainty and independent validation |
| Optimization | Does a proposed signal policy improve stated objectives? | Fixed evaluation suite, baseline, held-out seeds, constraint violations, no cherry-picked metric |
| Large-scale execution | Can more agents run without compromising semantics? | Profiles, same-engine conformance, deterministic partitioning, measured hardware results |
| Advanced visuals | Are weather, volumetrics, or richer assets worth their cost? | Readability/accessibility review and measured GPU budget; no inferred physics claims |

None of these tracks is necessary to demonstrate the MVP's central intervention experiment. An AI-generated explanation, if later explored, must cite recorded state/events and cannot substitute invented causes for model evidence. No AI service or paid API is needed now.

## Major risk register

Likelihood/impact are planning judgments, not statistical estimates. Owners are responsibility roles for future implementation, not assignments to additional agents.

| Risk | Likelihood / impact | Detection | Mitigation and gate | Owner |
| --- | --- | --- | --- | --- |
| Floating-point divergence across JS engines | Medium / high | Checkpoint comparison in Node, Chromium, Firefox, WebKit | Pin build/runtime; scope exact replay honestly; do not silently accept mismatches; consider a versioned integer dynamics model later | Simulation |
| Queues look convincing but model violates storage or red gates | High / high | Footprint, conservation, signal-entry assertions every tick | Implement admission/reservations before art; block Stage 01 on any unexplained violation | Simulation |
| Exclusive junction token creates low capacity and unrealistic delays | High / medium | Controlled saturation fixtures and traffic review | Publish limitation; use synthetic demand; do not claim calibration; evolve only behind new model tests/version | Simulation |
| Lane queues deadlock the grid | Medium / medium | No-progress diagnostics, blocked reasons, occupancy traces | Preserve agents, expose gridlock, use downstream admission checks; treat valid congestion separately from algorithm deadlock | Simulation |
| Completed-trip metrics falsely imply an improvement | High / high | Comparison audit including unfinished requests | Match manifest and windows; show censored/unmatched coverage and backlog; reject misleading summaries | Evidence/UI |
| Source queues hide excess demand or fleet size is overstated | Medium / high | Fleet/request conservation and separate counts | Never drop requests; report in-network, external backlog, parked fleet separately | Simulation/UI |
| Worker observation traffic causes UI stalls | Medium / medium | Snapshot bytes, main-thread tasks, allocations | Bounded snapshot rate/buffer; coalesce visual observations only; optimize transfer ownership if profiling demands it | Architecture |
| Frame drops change simulation behavior | Medium / high | Hash comparison under stalled/30/60/120 FPS rendering | Fixed ticks; worker authority; freeze stale rendering; no frame-driven physics | Architecture |
| GPU variability or context loss breaks core interactions | High / high | Capability, stress, context-loss and device checks | Standard/Reduced/Map modes; shared evidence and DOM controls; preserve worker run | Rendering |
| Visual ambition outruns performance or obscures data | High / medium | Art review plus frame/cost trace | Instance repeated geometry; reduce effects before information; no fog over critical stop lines | Experience |
| Canvas controls exclude keyboard or screen-reader users | High / high | Manual end-to-end assistive-technology flow | Semantic list, inspector, map/table equivalent, focus and shortcut discipline | Experience |
| Replay misses hidden state or pending commands | Medium / high | Restore at several nontrivial ticks, compare continuation | Canonical full checkpoint contract; include queues, accumulators, PRNG, reservations, cursors | Simulation |
| Malformed imported artifacts stall or alter the app | Medium / medium | Size/schema/hash/limit rejection fixtures | Bounded validation in worker; reject unsupported content and versions; never evaluate input code | Architecture |
| Dependency ecosystem changes break a fresh install | High / medium | Stage 01 clean install and peer metadata audit | Exact versions + lockfile; explicit TS/linter compatibility; review upgrades as changes | Build |
| Future Python backend becomes a second physics implementation | Medium / high | Boundary/import review and conformance checks | Store/orchestrate artifacts; execute the same TypeScript core for future batch runs | Architecture |
| OneDrive synchronization churn affects generated files | Medium / low | Local install/build errors | Ignore caches and generated runs; if necessary use a separate local build checkout while preserving repository documents | Build |

## Dependency and scope discipline

The critical path is contracts → topology/demand → traffic and metrics → replay → worker → presentation → interaction and fallback → evidence gate. Art assets can be refined after authoritative geometry is stable. Backend provisioning, account setup, maps, weather, energy, and pollution cannot block this path.

When a new feature is proposed, identify its authoritative inputs, transition rules, observables, verification fixture, performance cost, and stage. If those are absent, keep it out of the MVP. Findings may justify changing the specification, but changes must update versions, tests, and all affected acceptance criteria before implementation proceeds.
