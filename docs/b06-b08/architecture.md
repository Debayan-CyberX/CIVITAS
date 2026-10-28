# B06–B08 implementation notes

The existing traffic core, contracts, deterministic fixtures and golden hashes are retained. Browser code cannot import the simulation package; the lint boundary continues to enforce this. Worker-host changes enrich read-only `GET_DETAILS` facts with speed, reservation, queue ticks and route edges, and publish exact endpoint snapshots/acknowledgements on automatic pause and horizon completion. No new traffic command or causal state is introduced.

## Input and presentation path

`scripts/build-presentation-inputs.ts` uses the validated engine generator at build time to prepare all nine standard fleet/seed combinations. The browser fetches one same-origin input, validates its schemas and sends it through `SimulationClient.INIT`; the worker verifies hashes and graph semantics before READY. The browser never generates routes or demand. Imports are capped at 32 MiB and authenticated/replayed inside the worker before the application changes its geometry.

`scene/model.ts` maps east/elevation/north to `(east, elevation, -north)` and independently maps SVG north-up coordinates. Lane and movement indexes are sorted with the same ASCII ordering used by the worker. Agent IDs and body lengths come from the actual imported manifest/profile. Presentation state is separate from the worker's causal state.

`PresentationBuffer` holds at most three immutable snapshots and a bounded recent event window. At runtime the playhead trails by two simulated ticks, then advances only as far as the latest recorded endpoint. Pause and step sample the exact endpoint. Crossing records describe lane/connector arc distances at their effective tick; interpolation walks those paths instead of drawing a chord across the junction. Admission/arrival and discrete closure/signal changes use worker events. Missing or discontinuous evidence freezes; starvation recovery starts from the newly received snapshot instead of inventing a route across the gap. Reduced motion shows exact snapshot symbols and immediate camera focus.

## Authoritative geometry versus environment

The scene renders exactly 12 junctions, 17 segment footprints, 34 lane centerlines and stop lines, 48 building footprints with authored floor heights, and the worker's vehicle/signal/closure state. Vehicle transforms place the body behind its authoritative front bumper. Instanced bodies/cabins retain an instance-to-agent map for selection, independent of which parked/source agents are omitted from the visible fleet. Live queue overlays use reducer `lane_queue` samples and do not infer queues from animation.

Deterministic visual hashing generates additional architecture, roofs, glazing, trees, parks, a river and distant masses. These have no entity IDs, traffic routes or metric contribution. Setback checks keep local dressing away from segment footprints, junction areas and model buildings. There are no decorative traffic-carrying roads. The Display debug switch removes dressing and shows teal authoritative lane paths and champagne connector paths. The 48 authored masses remain.

Repeated geometry and material families are instanced. Standard includes facade detail and one bounded shadow map; Reduced omits that detail and dynamic shadows and limits DPR to 1. Map uses no Three.js renderer. Fog/frustum culling bound distant detail; there is no postprocessing, texture download, asset pipeline or renderer-owned traffic update. GPU resource counts and frame samples are exposed as read-only canvas diagnostics, with optional frame-work measurement during the explicit benchmark.

## Camera, picking and fallback

Three.js OrbitControls supplies damped orbit, pan, wheel and touch input. Distance, polar angle and target bounds are clamped; user input cancels focus transitions. Semantic buttons and viewport-only keyboard shortcuts provide pan, zoom, focus and reset alternatives. Selection never moves the camera until Focus or a district-focus action. Vehicle focus uses its current observed position.

Instanced hit handlers resolve explicit model IDs; decorative solids block picking through them without becoming simulated entities. Vehicle body/cabin hits resolve the same stable agent. The SVG map is independently authored from numeric geometry, with real roads, district/building footprints, phase/approach labels, measured queue overlays, patterned closures and snapshot-based vehicle positions. SVG road hit rectangles have positive area; traffic overlays ignore pointer events so Firefox/WebKit do not swallow road clicks. Semantic Explore buttons supply the full selection equivalent, including vehicles outside the visible network.

WebGL2 absence starts Map. Context loss unmounts only the renderer and offers City retry with a new context; the worker, selection, tick and commands remain. Sustained slow frames offer the same degradation without changing fleet size or physics. A worker failure disables playback and requires explicit recovery from the last export, or a clearly labelled new experiment.

## Acknowledgements and evidence

`bridge/application.ts` sends all controls through `SimulationClient`. Displayed mode/speed come from CONTROL_ACK, not optimistic updates. Closure submission first obtains the current topology version through GET_DETAILS. Accepted commands remain pending until their effective tick; the snapshot/event then proves application. Single-direction and atomic two-direction commands preserve draining vehicles and reservations. Blocked/rejected operations expose the actual worker reason. Replayed historical closure events do not masquerade as new interventions.

The UI shows in-network vehicles, source-queued vehicles, not-yet-admitted requests, unfinished due requests, completed arrivals and travel statistics with their coverage. The evidence table retains every sample's scope, unit, definition version, tick, window, sample count, denominator and quality flags. Completed-only duration samples explicitly exclude unfinished requests. Pollution, energy, population, AI recommendations, comparison and signal-timing intervention have explicit unavailable states.

Export pauses the worker and downloads its canonical artifact. Import verifies full replay and restores paused. “Verify replay from origin” uses that same verified worker import and restores the endpoint; it does not claim an animated timeline, seeking or branching. Reset with existing observations/interventions opens a keyboard-accessible dialog with export and focus return. The historical foundation remains at `/foundation`; its tests retain every original assertion and only change their route.
