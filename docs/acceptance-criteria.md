# CIVITAS — acceptance criteria

Status: proposed gates, not test results. **No simulation, rendering, performance, or accessibility criterion has been executed in Stage 00.** Numerical thresholds are requirements to measure during implementation.

Stage 01 gates prove the engineering slice. Full-MVP gates add Stages 02–03. Every failure needs a recorded reason and resolution; silently relaxing a threshold or regenerating a golden file is not a pass.

## Stage 00 dossier gate

| ID | Required evidence |
| --- | --- |
| DOC-01 | All seven requested documents exist, are linked, and distinguish Stage 01, complete MVP, and research |
| DOC-02 | Stack, worker/core ownership, full domain schema, tick/replay contract, metrics, visual/interaction system, risks, and future infrastructure are specified |
| DOC-03 | No app scaffolding, installed dependencies, Docker, fabricated results, or paid API requirement is introduced |
| DOC-04 | Stage 01 has exact proposed package pins, task dependencies, test fixtures, verification commands, and exit artifacts |

These are document review checks only. They do not establish that the planned model works.

## Stage 01 simulation gates

| ID | Test and required outcome |
| --- | --- |
| SIM-01 | Validate Aster: 3 district polygons partition bounds, 12 nodes, 17 segments, 34 directed lanes, 48 buildings, continuous connectors, no dangling references or road/building intersections; all base gateway pairs have legal routes |
| SIM-02 | Initialize fleet sizes 100, 200, 300, default 200. Conservation assertions pass every tick across 9,000 ticks for all three standard seeds. No negative speed, overlap, invalid primary location, NaN, or orphan trip |
| SIM-03 | At least 100 agents are simultaneously in-network at some tick in the 300-agent baseline after tick 1,200. Record peak and tick. A fleet-setting label alone does not satisfy this gate |
| SIM-04 | PRNG seed expansion and xoshiro128** output match independent published/reference vectors and a reviewed local fixture. Repeated seed gives identical manifest hash; distinct standard seeds produce distinct manifests |
| SIM-05 | Routing fixtures: directed adjacency, turn restrictions, known shortest-path costs, equal-cost lexicographic tie-break, unreachable destination, closure invalidation, and committed-current-edge preservation all match independently calculated expectations |
| SIM-06 | Test ballistic integration independently: a prescribed constant 2 m/s² acceleration from rest for 10 s yields 20 m/s and 100 m within the 1 mm quantization accumulation bound of 0.1 m. A braking fixture stops at `v²/(2*abs(a))` within 0.1 m and never reverses |
| SIM-07 | Free-road IDM approaches its configured desired speed without exceeding the limit by more than 1 mm/s; stopped-leader and red-stop fixtures stop without crossing the forbidden boundary or overlapping. Normal baseline produces zero safety projections above 1 mm and zero emergency-limit violations |
| SIM-08 | Signal test confirms 120 green, 30 amber, and at least 20 all-red transitions per available approach. Unreserved entry is forbidden on amber/red; a prior reservation clears safely; conflicting ownership never overlaps; downstream-full fixture prevents admission |
| SIM-09 | Close `L:J11>J21` at tick 3,000, reopen at 6,000: no new entry commitments occur while closed. Preexisting occupants/reservations drain without deletion. New routes avoid the lane, reopen permits future commitments, and logs identify effective ticks and exceptions |
| SIM-10 | In a controlled alternate-route fixture, closing the chosen edge changes the planned route and increases its frozen-current-topology route cost by the independently expected amount. Queue and detector changes arise from core events, not UI animation |
| SIM-11 | In a disconnected fixture, requests and agents remain accounted for with blocked reasons for 1,000 ticks. Reopening restores route availability on the next permitted retry. No teleport, silent drop, or automatic completion |
| SIM-12 | During a sustained-demand red-gate fixture, queue count becomes positive after ten low-speed ticks. On green with downstream space, at least one real exit crossing occurs. Queue clearing is observed, never scripted |
| SIM-13 | For seeds `104729`, `130363`, `155921`, request manifests remain byte-identical between baseline and closure runs even though admissions/completions differ |

Conservation and safety properties run on generated small valid graphs and command sequences using fast-check: at least 100 cases of 1,000 ticks per property, with the generator seed and minimized failing case retained. Scheduled full Aster runs complement these properties; neither replaces the analytical fixtures.

## Stage 01 reproducibility and metrics gates

| ID | Test and required outcome |
| --- | --- |
| REP-01 | Two uninterrupted 9,000-tick runs of the same artifact yield identical checkpoint hashes at every 100 ticks, final hash, derived-event digest, and metric series within each pinned supported runtime family |
| REP-02 | Export, import, replay from S0 reproduces REP-01 for the closure run. A command submitted twice has one application. An invalid command has a rejection with no authoritative state mutation |
| REP-03 | Checkpoint restore at ticks 100, 2,990, 3,010, and 6,010, followed by the same remaining commands, matches uninterrupted execution. Include checkpoints with occupied connectors, active queues, and outstanding future commands; add a targeted fixture if those standard ticks lack the required state |
| REP-04 | Run identical accepted command logs under headless execution, 0.25x/1x/2x/4x scheduler pacing, 30/60/120 FPS rendering, scripted main-thread stalls, and Map mode. Equal authoritative ticks produce equal hashes in the same runtime |
| REP-05 | Report Node/Chromium/Firefox/WebKit fingerprint and checkpoint comparison. Same-runtime replay must be exact. Any cross-runtime mismatch is explicitly classified as incompatible for exact artifact replay; import must not assert verified portability |
| REP-06 | Reordered visual messages, stale epochs, worker reset, and import lifecycles cannot replace current authoritative observations. Rejections cover unsupported versions, invalid hashes, over-32-MiB imports, invalid entity counts, and malformed payloads. Add seek lifecycle coverage in Stage 03 |
| MET-01 | Independent metric reducer fixture: one trip requested at tick 0, admitted at 20, arriving at 220, travels 100 m with 20 s of network vehicle-time and a 10 s base reference. Expected network mean speed is 5 m/s = 18 km/h, network travel time 20 s, request-to-arrival duration 22 s, delay 12 s, completed count 1 |
| MET-02 | Queue threshold: nine consecutive ticks below 0.5 m/s do not qualify, ten qualify, and a tick at or above 0.5 clears the counter. Source-queued agents are excluded from in-network queued share |
| MET-03 | Empty windows yield null for undefined speed/percentiles/shares, zero for actual event counts, and explicit coverage. Verify trailing `(start,end]` boundaries, partial warm-up duration, nearest-rank percentiles, and no duplicate detector crossing at lane/connector boundaries |
| MET-04 | Every visible metric and exported metric carries definition version, unit, as-of tick, actual window, denominator/sample count, and scope. UI values equal authoritative reducer output after declared display rounding |
| MET-05 | Reconstruct total traveled distance, vehicle-time, arrivals, and source backlog from independent fixture observations and reconcile with aggregates. District geometry splits cannot double-count lane contributions |
| MET-06 | Energy/pollution have no numeric reading in the traffic MVP. Missing data cannot become zero, and visual fog cannot appear under an air-quality label |

MET-01 is a hand-authored reducer input, not an asserted result of the IDM city scenario. Keep analytical reducer tests independent of the implementation being tested.

## Stage 01 worker, renderer, and functional access gates

| ID | Test and required outcome |
| --- | --- |
| SYS-01 | The core runs without DOM, React, Three.js, Zustand, or a Worker. Dependency/import checks prevent those imports. Vehicle-state writes exist only in the worker-owned core |
| SYS-02 | Paused one-tick step increments tick by exactly one. Pause acknowledgement identifies a completed tick boundary. A hidden tab or wall gap above 500 ms pauses visibly and resumes without background catch-up or skipped simulation transitions |
| SYS-03 | Snapshot cadence is every two ticks plus explicit control snapshots; regular wall-time publication never exceeds 20 Hz at 4x. Buffer is bounded, stale view freezes without extrapolation, and observation coalescing loses no commands/events |
| SYS-04 | Inject known A/B snapshots, including a 90° connector turn: rendered positions follow the authoritative path within 1 cm and alpha remains clamped. Spawn/arrival and discrete signal/closure boundaries use recorded tick transitions. Pause/step displays the exact authoritative snapshot |
| SYS-05 | Selecting, orbiting, focusing, changing quality, resizing, and switching City/Map cannot mutate authoritative hashes or apply interventions |
| INT-01 | Complete the flow: load paused → play → select named directed road → pause → submit closure → step → read applied tick and queue/route effect → reopen → export → import/replay. Every action has visible pending/accepted/rejected feedback |
| INT-02 | A semantic entity list and inspector provide road selection, directional closure, playback, stepping, metric inspection, and export using keyboard alone. Focus is visible, logical, and restored after a dialog closes |
| FALL-01 | With WebGL2 disabled, the independent SVG map and tables support INT-01 using the same worker. Forced graphics context loss offers that mode without resetting tick, commands, or selection |
| BUILD-01 | Clean checkout installs with `npm ci`, strict typecheck, lint, unit/property tests, browser tests, and production build. Worker module loads from the production build. No peer override, forced install, credentials, Python, database, paid service, or container is required |

## Performance budgets

All budgets are proposed release gates. Record actual hardware, OS, browser version, viewport, DPR, quality preset, power mode, build SHA, and scenario identity. Use production builds, no open developer tools during frame sampling, a 60 s warm-up, then a 120 s sample at 300 agents and 1x plus a separate 4x run. Report p50/p95/p99 rather than one favorable average. GPU timings may be unavailable; report unavailable instead of estimating them as measurements.

Reference test classes are targets to provision, not a claim about available hardware:

- Standard: Windows 11, Intel i5-1135G7-class CPU, Iris Xe-class integrated GPU, 16 GB RAM, 1920×1080 CSS viewport, DPR 1, current pinned Chromium.
- Reduced: the same device at 1280×720, DPR 1 with Reduced preset. Supplement with an actual mid-range mobile device for Map usability and responsiveness; emulation alone cannot establish device GPU performance.

| ID | Budget | Gate |
| --- | --- | --- |
| PERF-01 | At 300 agents, core tick p95 <= 2 ms, p99 <= 5 ms; achieve 1x and 4x without skipped ticks on the reference CPU | Stage 01 and MVP |
| PERF-02 | Standard frame interval p95 <= 20 ms, targeting 60 FPS; Reduced p95 <= 33.3 ms, targeting 30 FPS. Report missed-frame proportion and observed FPS distribution | Stage 02/MVP; preliminary measurement in Stage 01 |
| PERF-03 | Main-thread application work p95 <= 6 ms/frame; no application long task > 50 ms during the ordinary interaction sample. Selection feedback <= 100 ms p95; command acceptance acknowledgement <= 250 ms p95 at 1x | Stage 01 and MVP |
| PERF-04 | Standard <= 150 draw calls, <= 250,000 visible triangles, DPR cap 1.5; Reduced <= 80 calls, <= 120,000 triangles, DPR cap 1.0. Exceeding a count requires a reviewed measured equivalent, not an unrecorded exception | Stage 02/MVP |
| PERF-05 | Steady total app JS heap across main/worker <= 256 MiB; render snapshot <= 32 KiB and at most three buffered. Estimated GPU allocation <= 128 MiB, explicitly labeled estimate from resource sizes | Stage 01 and MVP |
| PERF-06 | No monotonic retained-state growth after repeated reset/import and 30 min interaction. End heap after collection within 10% of warmed baseline; bound logs by the 9,000-tick run and explicit artifact export/reset | Stage 03/MVP |
| PERF-07 | Initial app plus required city/fonts <= 3 MiB compressed transfer; initial executable JS <= 750 KiB gzip. Interactive controls <= 5 s on a cold simulated 10 Mbps / 100 ms RTT load; no mandatory runtime external request | Stage 02/MVP |
| PERF-08 | A 9,000-tick, 300-agent headless run plus scheduled hashes completes within 30 s on the reference CPU; a full JSON artifact <= 32 MiB. Report checkpoint/event/metric bytes separately | Stage 01 and MVP |

For PERF-03, a command's *effect* may wait for its accepted tick when paused or at 0.25x. Measure acknowledgement separately from effect. For PERF-05/06 use browser tooling that includes worker isolates; do not present `performance.memory` on the main thread alone as total application memory.

Standard disables effects as needed to remain within budget. Reduced removes AO, dynamic shadows, and atmospheric shader cost, then reduces geometry/draw cost. Map preserves simulation, directionality, interventions, and evidence. Quality adaptation never reduces authoritative fleet size or changes dt, demand, routing, or metrics. Offer a persistent user override and announce a quality change once.

## Full-MVP experience and accessibility gates

| ID | Test and required outcome |
| --- | --- |
| EXP-01 | Art review at overview, street/road focus, selected vehicle follow, closure, and Map views confirms mineral palette, coherent architecture, readable stop lines/vehicles, restrained lighting, editorial hierarchy, and no decorative metrics/particles |
| EXP-02 | Camera remains within bounds, input interrupts transitions, Focus respects panels, and follow arrival/stale evidence does not jump to another agent. Reduced motion eliminates camera easing and offers static vehicle symbols |
| EXP-03 | Closure state and route/blocking explanation are driven by acknowledged events. Existing occupants drain visibly. An intervention is never described as beneficial before measured comparison |
| EXP-04 | At 320 CSS px width and 200% text zoom, controls and data reflow. Pointer, touch, and keyboard flows remain usable; drag and multitouch have simple alternatives |
| A11Y-01 | Automated axe checks report zero serious/critical issues on loaded, selected, dialog, comparison, and fallback views. Manual review covers issues automation cannot detect |
| A11Y-02 | All functionality is keyboard operable, with visible unobscured focus, no keyboard traps, shortcut-disable setting, and no global interception inside text inputs |
| A11Y-03 | Text contrast >= 4.5:1 for ordinary text, >= 3:1 for qualifying large text; essential graphical controls/states >= 3:1. Check actual composited colors. State distinctions survive grayscale and forced-colors mode |
| A11Y-04 | Primary targets >= 44×44 CSS px; other targets meet WCAG 2.2 AA size/spacing requirements. Hover information is also available by focus and activation |
| A11Y-05 | NVDA with supported Chromium completes road close/reopen, step, metric inspection, and export using semantic views. Supplement VoiceOver/Safari for full-MVP coverage; document browser/platform limitations |
| A11Y-06 | Reduced motion, text zoom, live announcements, moving-content pause, dialog focus return, and metric updates preserve user control and focus. Charts/timelines have tabular/text alternatives |
| MVP-01 | Seek to a typed tick or accessible timeline position and reproduce its expected hash, paused, in a new epoch; submitting a change after seeking creates a separate branch with correct command prefix |
| MVP-02 | Baseline/closure comparison uses identical inputs/manifest and windows for all three standard seeds. It shows raw and relative deltas where defined, matched-trip coverage, unfinished demand, and no mandatory assumed direction of improvement |
| MVP-03 | Artifact corruption/recovery, worker failure, graphics loss, blocked routes, zero demand, full source lane, and insufficient performance have explicit tested outcomes. No canned data substitutes for missing simulation |

Accessibility targets follow [WCAG 2.2](https://www.w3.org/TR/WCAG22/). Passing axe alone does not establish conformance. Performance and visual checks use a real GPU in addition to browser automation.

## Test layers and evidence bundle

Use Vitest for core, contracts, reducer, and checkpoint tests; fast-check for invariants; Playwright for actual worker bundling, controls, screenshots, cross-browser/fallback behavior, and browser artifact replay; axe plus manual assistive-technology flows for accessibility. These tools serve distinct risks. Test expected behavior, not a second copy of the implementation. [Playwright's browser documentation](https://playwright.dev/docs/browsers) explains its separate Chromium/Firefox/WebKit binaries; a WebKit automation pass does not replace actual Safari device verification.

Each stage's review bundle contains source/build identity, lockfile, actual command output, fixture names and seeds, artifact hashes, compatibility matrix, safety/conservation diagnostics, performance traces, accessibility notes, and a list of failed or unavailable checks. Keep machine-specific timing data separate from deterministic state. The initial Stage 00 dossier has no such measured bundle; the first one is a Stage 01 deliverable.
