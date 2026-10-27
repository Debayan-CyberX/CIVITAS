# CIVITAS — vision

Status: Stage 00 specification. Prepared 2026-10-28. No results have been generated.

## The experience

CIVITAS is a living model of a small fictional city, presented with the care of an architectural film and the accountability of a simulation instrument. A person should be able to watch traffic form, inspect the conditions that constrain it, close a road, and trace the resulting queue and route changes back to that action.

The central question is: **What changes when I intervene, and what evidence explains the change?**

The opening composition is a warm, low oblique view of a compact city. Moving vehicles, signal phases, and genuine queues establish that time is passing. The interface offers a small set of useful actions: inspect, pause, step, change speed, close or reopen a road, replay, and compare an experiment with its baseline. The city occupies the screen; controls support observation.

This is initially a **synthetic urban digital twin demonstrator**: a reproducible model of its own fictional city. It has no live sensor connection, surveyed real city, or empirical calibration. Calling it a validated real-world digital twin would overstate its evidence. Future real-city work needs provenance, calibration data, uncertainty estimates, and independent validation.

## Who it serves

- Curious observers need an understandable explanation of why traffic changes.
- Designers and simulation engineers need deterministic scenarios, inspectable state, and exportable evidence.
- Presenters need cinematic framing that does not compromise the model or hide failure.

The MVP supports exploratory experiments and engineering demonstrations. It does not support policy decisions, operational traffic control, emissions compliance, or public-health conclusions.

## One city: Aster

Aster is a deliberately small, fictional city in local metric coordinates. Its three districts are **Kiln Quarter**, **Exchange**, and **Foundry Reach**. Their identities come from land use, massing, street proportions, and material variation, rather than separate visual themes.

| District | Spatial character | Simulation role | Visual character |
| --- | --- | --- | --- |
| Kiln Quarter, west | Residential courtyards and smaller blocks | Origin-heavy morning demand profile | Warm limestone, low and medium massing |
| Exchange, center | Offices, civic buildings, mixed use | Strong destination demand and through routes | Taller pale concrete volumes, graphite bases |
| Foundry Reach, east | Workshops, warehouses, mixed housing | Employment destinations and cross-city demand | Terracotta aggregate and restrained dark metal |

The authoritative network is the 12-node, 17-segment, 34-directed-lane fixture defined in [the simulation specification](simulation-spec.md#city-fixture). It has alternate paths, signalized intersections, and 48 building records. These counts are chosen inputs, not observations. A fleet setting selects 100, 200, or 300 vehicle agents; the default is 200. Fleet size and the number currently moving are reported separately.

Fictional population profiles generate a fixed, versioned trip manifest. The simulated cohort is not the district's total population. Buildings supply places and district identity; building occupancy does not secretly create extra trips.

## The minimum convincing experiment

1. Load the Aster morning scenario with a visible seed, build identity, and paused clock.
2. Run it, observe signal queues, and inspect lane speed, queue count, and completed trips.
3. Pause at a known tick and close one direction of a selected road.
4. See an acknowledged intervention, entry restriction, existing vehicles draining, and rerouted or blocked trips.
5. Reopen the road and observe recovery or persistent congestion without a scripted improvement.
6. Export the scenario and command log. Replay the same experiment and verify the same authoritative state hashes in its supported runtime.
7. In the completed MVP, compare against a baseline with the same manifest and time window. An intervention may help, hurt, or produce no measurable change.

Visible activity must originate in model state. Vehicles cannot move along decorative loops. Traffic overlays must correspond to measured queues or speeds. A camera cut cannot change demand, and a slow frame cannot slow an individual driver's physics.

## Scope boundary

| Capability | Stage 01 | Complete MVP, after Stages 02–03 | Later research |
| --- | --- | --- | --- |
| Three districts and connected lane graph | Functional fixture and simple massing | Authored architectural scene | Real-city import and geographic registration |
| 100–300 agents, signals, closures, congestion metrics | Deterministic core and inspection controls | Refined explanation, exports, full comparison workflow | Multimodal traffic, calibrated behavior |
| Replay | Export/import, reset-and-replay verification | Checkpoint seeking, branch comparison UI | Distributed execution and collaboration |
| Cinematic presentation | Basic readable scene and camera | Full art direction within performance gates | Weather and advanced atmosphere |
| Energy and pollution | Domain contracts; unavailable outputs | Unavailable unless separately validated and approved | Building load, fleet energy, emissions and dispersion models |
| Backend | Architecture only | Browser-local operation | FastAPI persistence with PostgreSQL/PostGIS |

The complete MVP is the cumulative exit of Stage 03. Stage 01 is a functional engineering slice and must not be described as the finished experience.

## Principles that constrain decisions

**Cause before decoration.** Invest in finite storage, conservative junction admission, and measurable queues before adding visual detail.

**One authority for time.** The worker advances fixed simulation ticks. Rendering observes snapshots. All camera motion, lighting, and interface animations are presentation state.

**Evidence is part of the interface.** A metric has a unit, definition, window, sample size, and run identity. Missing information displays as unavailable. Scenario settings are labeled as inputs.

**Beauty through restraint.** Mineral materials, warm highlights, strong composition, quiet typography, and controlled movement create the premium character. No neon grids, meaningless particles, invented utility totals, or animated counters disconnected from the model.

**Failure is observable.** A blocked route, invalid command, stale worker, lost graphics context, or overloaded machine has an explicit state and explanation. Nothing silently teleports, deletes demand, or substitutes canned data.

**Accessible operation is a first-class view.** Semantic controls, a searchable entity list, a 2D map, and textual metrics expose the same experiment without requiring 3D pointing.

## What success means

A reviewer can identify a constrained road, explain the queue from signal and downstream conditions, make a closure, and recover the resulting run from its artifact. The same simulation works with a cinematic renderer, a simple 2D view, or no renderer. Quantitative success and presentation quality must independently pass [the acceptance criteria](acceptance-criteria.md).
