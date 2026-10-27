# CIVITAS — The Living City

An interactive urban simulation laboratory for a fictional city. The city must explain its behavior through reproducible movement, interventions, and measured outcomes.

**Current stage: Stage 00 — architecture and experience specification only.** There is no application, simulation implementation, benchmark result, or deployment in this repository yet. Stage 01 is specified and has not started.

## Read the dossier

1. [Vision and scope](docs/vision.md)
2. [Architecture and ownership boundaries](docs/architecture.md)
3. [Simulation contract and domain model](docs/simulation-spec.md)
4. [Art direction and interaction system](docs/design-system.md)
5. [Roadmap, decisions, and risks](docs/roadmap.md)
6. [Acceptance criteria and verification](docs/acceptance-criteria.md)
7. [Exact Stage 01 build plan and dependencies](docs/stage-01-build-plan.md)

The simulation specification owns model semantics, units, tick ordering, and metric definitions. Acceptance criteria own release gates. The build plan owns implementation sequence and dependency pins. Other documents must reference these contracts rather than redefine them.

## Constraints

- React, TypeScript, Vite, React Three Fiber, Three.js, Zustand, and a dedicated simulation Web Worker.
- FastAPI and PostgreSQL/PostGIS are future infrastructure, outside the browser MVP's critical path.
- No Docker, paid API requirement, real-world calibration claim, fabricated results, or decorative metrics.
- All numerical values in this dossier are **design inputs, proposed budgets, analytical examples, or acceptance thresholds**. They are not measured performance or city outcomes.

Prepared on 2026-10-28. External compatibility references were checked on that date; installation and peer compatibility still require verification at Stage 01.
