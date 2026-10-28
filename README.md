# CIVITAS — The Living City

An interactive urban simulation laboratory for a fictional city. The city must explain its behavior through reproducible movement, interventions, and measured outcomes.

**Current state: Stage 01 engineering acceptance complete on the recorded test host.** CIVITAS includes Aster's deterministic traffic engine, worker-driven 3D city, independent SVG map, directional closures, inspection, metrics and verified JSON replay. [The B06–B08 report](docs/b06-b08/README.md) contains measured results, test evidence and device/accessibility limitations. Stage 02 cinematic assets and full-MVP release certification remain future work.

Use Node 24.22.1 / npm 11.19.1, then run `npm ci` and `npm run dev`. Open <http://127.0.0.1:5173>. Start paused, press Play, select a road or explore entities in Laboratory, close a direction, then step or resume to apply it. [Development and validation instructions](DEVELOPMENT.md) describe the available commands and evidence. The historical B01 diagnostic is at `/foundation`.

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
- Numerical thresholds in the original dossier are design requirements. Measured outcomes are kept separately in [B02–B05 evidence](docs/b02-b05/README.md) and [B06–B08 evidence](docs/b06-b08/README.md).

Prepared on 2026-10-28. External compatibility references were checked on that date; installation and peer compatibility still require verification at Stage 01.
