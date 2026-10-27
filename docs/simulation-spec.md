# CIVITAS — simulation specification

Status: Stage 00 normative design. Version `sim-spec/1`. All values below are chosen model inputs or required tests, not measured city behavior.

## Model purpose and limits

The MVP is a microscopic, lane-based road simulation with finite road storage, explicit signal control, conservative intersection reservations, scheduled travel demand, and entry closures. It is intended to produce explainable congestion and reproducible intervention experiments. It is not a calibrated traffic predictor.

Each directed road has one lane. Vehicles cannot overtake, change lanes, reverse, or make U-turns. All agents are passenger vehicles with one parameter profile. Junction service is deliberately conservative: one vehicle owns the conflict area at a time. This sacrifices realistic intersection capacity to make collision avoidance and downstream blocking inspectable. Realistic parallel movements, heterogeneous drivers, pedestrians, transit, freight, and parking competition are later work.

## Units, coordinates, and identities

- Time is an integer tick; `dt = 0.1 s`, or 10 ticks per simulated second. `S_0` is the validated initial state. Transition `k` takes `S_(k-1)` to `S_k`.
- Static horizontal coordinates are local east/north meters, elevation is meters. The city has no real latitude/longitude. Three.js maps these to `(east, elevation, -north)`.
- Authoritative kinematic state stores integer millimeters, millimeters/second, and millimeters/second squared. Evaluate the following model in IEEE-754 binary64, then quantize after each transition. Round with the explicit rule `floor(value + 0.5)`, including signed values; do not rely on locale formatting or unspecified serialization.
- Speeds are nonnegative; signed acceleration records braking. Integration uses seconds. Metric accumulators use integer mm and vehicle-ticks where possible.
- IDs are immutable, ASCII, version-scoped strings. Sort by bytewise ASCII order, not locale comparison. Array slots may be reused only through a stable `agentId -> slot` mapping included in checkpoints.
- Scenario, city, manifest, engine, protocol, checkpoint, and metric-definition versions are separate. Schema changes require explicit migration or rejection.

## City fixture

`aster-v1` occupies bounds `east=[-90,630] m`, `north=[-90,450] m`. Nodes are `J{column}{row}`, where column is 0–3, row is 0–2, east is `180*column`, and north is `180*row`.

```text
north
360    J02 ---- J12 ---- J22 ---- J32
        |        |        |        |
180    J01 ---- J11 ---- J21 ---- J31
        |        |        |        |
  0    J00 ---- J10 ---- J20 ---- J30     east
        0       180      360      540
```

Connect every horizontally and vertically adjacent pair. This yields 12 nodes, 17 physical segments, and 34 directed lanes. Each segment has two opposite directions and one lane in each direction. Physical IDs are canonical endpoint pairs such as `R:J11:J21`; lane IDs are `L:J11>J21`. The scripted experiment closes `L:J11>J21`, then reopens it. Both directions may be closed through an atomic two-lane command.

Junction conflict areas extend 12 m from node centers. Straight lane centerlines therefore run from 12 m beyond their origin node to 12 m before their destination node: 156 m per lane. Lane width is 3.2 m, speed limit is 13.889 m/s, and movement connectors are speed-limited to 5.556 m/s. Static connector polylines join stop lines and exit points; their lengths are calculated from those polylines. All geometry is reviewed for continuity and road/building clearance. Route cost includes connectors, so cutting out intersection geometry cannot produce false free-flow times.

District polygons partition the bounds without overlap: Kiln Quarter uses `east < 150`, Exchange uses `150 <= east < 390`, and Foundry Reach uses `east >= 390`. Their outer limits follow the city bounds. Assign buildings by centroid and node demand gateways by node position. Split cross-boundary lane metric contributions by traveled geometry; do not charge a complete lane to both districts.

Create 48 static building records, 16 per district, with footprints, floor counts, use classes, and non-overlapping road setbacks. All dimensions and land uses are fictional inputs. Stage 01 uses simple extrusions. Synthetic population metadata may be absent; absence does not disable traffic. The demand cohort is explicitly configured independently of total district population.

## Domain model

The table specifies required fields and invariants; it is a schema design, not an instruction to implement all subsystems in Stage 01.

| Entity | Static fields | Dynamic fields / invariants |
| --- | --- | --- |
| `CityDefinition` | ID/version, local frame, bounds, all entity tables, topology hash | Immutable during a run; every foreign key resolves |
| `RoadNode` | ID, position, incoming/outgoing lane IDs, district | At least one valid incoming and outgoing direction; all base nodes strongly connected |
| `RoadSegment` | ID, endpoint nodes, physical footprint, lane IDs | Closing both directions is atomic; rendering geometry does not set capacity |
| `Lane` | ID, segment, from/to nodes, centerline, length, width, limit | Entry mode `OPEN` or `CLOSED_TO_ENTRY`; ordered occupancy; finite space |
| `Movement` | ID, incoming/outgoing lane, node, connector polyline, length, speed limit | No U-turn; valid outgoing link; at most one conflict-area owner per junction |
| `Intersection` | Node, ordered available approaches, movement IDs, signal ID | Reservation ID, outgoing-space hold, clearance state; no conflicting reservations |
| `SignalPlan` | Approach green 120 ticks, amber 30, minimum all-red 20; initial approach | `phase`, `remainingTicks`, cycle count; all-red extends while occupied |
| `District` | ID, polygon, land-use profile, optional synthetic population reference | Aggregates with explicit metric scope; no self-updating decorative totals |
| `Building` | ID, district, footprint, elevation, floors, floor height, use, gateway | No physical occupancy dynamics in the traffic MVP; energy profile may be null |
| `PopulationDemand` | Cohort/fleet size, OD weights, schedule settings, manifest hash | Due/queued/completed/blocked requests; not total city population |
| `TripRequest` | ID, agent ID, requested departure tick, origin/destination gateways, free-flow reference | `FUTURE`, `WAITING_FOR_AGENT`, `SOURCE_QUEUED`, `IN_NETWORK`, `COMPLETED`; blocked is an orthogonal reason |
| `VehicleAgent` | ID, length, behavior profile, itinerary IDs | `PARKED`, `SOURCE_QUEUED`, `ON_LANE`, `ON_CONNECTOR`; front arc position, speed, route/cursor, reservation, trip ID, wait counters |
| `Route` | Ordered lane and connector IDs, deterministic free-flow cost, topology version | Current edge retained during a closure; remainder may be replaced only at legal decisions |
| `Intervention` | Command ID, accepted tick, sequence, target lane set, close/open | Applied once, acknowledged, logged; no direct position edits |
| `EnergyProfile`, future | Building base/occupancy load coefficients, vehicle propulsion type, coefficient sources/units | No MVP output when coefficients or valid model are absent |
| `PollutionModel`, future | Pollutant, emission coefficients, spatial grid, weather inputs, method/version | Separate source mass from ambient concentration; no proxy labeled as measured air quality |
| `MetricDefinition` | ID/version, unit, window, scope, numerator/denominator definitions | Null when undefined; includes sample count and run/tick identity |
| `RunState` | Run input identity and compatibility fingerprint | Tick, agents, lane footprints, signals, reservations, closures, trip queues, pending commands, PRNG state, accumulators, event sequence |

An agent has exactly one lifecycle state. Its physical body can span an incoming lane, connector, and outgoing lane; reserve and test these occupied intervals until its rear clears. Primary location follows the front bumper and is used for unique agent counts. A spanning body is not two vehicles.

## Seeded demand and randomness

Use `xoshiro128** 1.1` with four unsigned 32-bit state words, following the [authors' reference implementation](https://prng.di.unimi.it/xoshiro128starstar.c). Seeds are unsigned 32-bit integers, including zero. Expand the zero-extended seed using two successive outputs of the authors' [64-bit SplitMix reference](https://prng.di.unimi.it/splitmix.c); map low/high 32-bit halves of the first output to state words 0/1, then the second to 2/3. Implement seed expansion with unsigned 64-bit BigInt masking; generator arithmetic then uses explicit unsigned 32-bit operations. Store the complete initial state and algorithm version. Golden vectors must cover seed expansion, wrapping, rotation, and generator output. Reject an imported all-zero generator state. Never call `Math.random`, wall clocks, or crypto randomness inside the deterministic core. A UI may choose a seed before initialization; the chosen seed is then explicit input.

The expanded generator is the demand stream. A visual stream is a copy advanced once with the reference xoshiro128** jump function before use, and is owned exclusively by presentation. Visual randomness cannot consume the demand stream. Traffic behavior is deterministic in the MVP and needs no per-tick random draws.

Generate the complete 900-second manifest before starting a run. Fleet sizes are exactly 100, 200, or 300, default 200. Each agent receives an itinerary of trip requests: first departure uniformly selected from ticks 0–599, then requests at 1,200-tick intervals while requested tick is below 9,000. Each next origin equals its preceding destination, so a busy agent never teleports to a different origin. If a previous trip is unfinished, the next due request waits for that agent; after arrival it joins the source queue. Requested times never move because traffic is slow.

The first origin district weights are `(5,2,3)` for west/center/east. Destination weights are:

| Origin \ Destination | Kiln Quarter | Exchange | Foundry Reach |
| --- | --- | --- | --- |
| Kiln Quarter | 1 | 6 | 3 |
| Exchange | 4 | 1 | 5 |
| Foundry Reach | 3 | 6 | 1 |

These are synthetic morning-demand assumptions, not fitted probabilities. Sample integers using rejection sampling over unsigned generator output, avoiding modulo bias. Select gateways from the chosen district in stable ID order; exclude the current origin gateway. Store all sampled requests so baseline and intervention runs consume exactly the same demand, even when their routes or completion times differ.

Vehicle agents are the finite fleet. Report fleet size, in-network vehicles, source-queued agents, parked agents, and outstanding trip requests separately. A request waiting for a busy agent is demand backlog, not another vehicle. At all times:

```text
fleet = parked + sourceQueued + onLane + onConnector
requestsDue = completed + inNetworkRequests + sourceQueuedRequests + waitingForAgentRequests
```

No request is silently dropped when the network is full or disconnected. FIFO source queues use `(requestedDepartureTick, tripId)`; per-agent itinerary order is also enforced. Admit at most one vehicle per source lane per tick when its full body and minimum rear gap fit, no outgoing-space hold conflicts, and a valid route exists. Demand waiting outside the network is counted and timed. Origins and destinations are explicit boundary sources/sinks, not simulated parking facilities. A trip exits at the final approach endpoint into an off-network sink, releasing its lane occupancy and entering `PARKED` at that destination gateway.

## Routing and closures

Run Dijkstra on the expanded lane/movement graph. Integer costs are free-flow traversal times in ticks, `ceil(length / limit / dt)`, with at least one tick per edge. Compute each trip's reference shortest-path cost on the **unmodified base network** and freeze it in the manifest. Resolve equal costs by lexicographic full edge-ID sequence. No random routing, dynamic travel-time oracle, or knowledge of future closures.

At departure, choose the shortest currently admissible route. Recalculate a remaining route only when it becomes invalid or an agent with no route retries. Cache by `(origin decision point, destination, topologyVersion)`. A close/open increments the topology version and invalidates affected caches. A blocked request retries on topology change or every ten ticks in stable request order.

A closure prevents **new admission commitments** to its directed lanes at the effective tick. Vehicles already on the lane and reservations committed before that tick may drain. The inspector must distinguish closed-to-entry, committed arrivals, and remaining occupants. There is no barricade collision simulation. A reservation granted before closure may complete; new reservations and source admissions may not target that lane. Closing both directions is evaluated and applied together.

Vehicles retain their current physical edge and any committed connector. Replan the uncommitted suffix before requesting a new junction reservation. If no legal suffix exists, stop safely before the decision point, remain present, and log `ROUTE_BLOCKED`. Reopening never teleports vehicles or erases queues. Already valid detours remain until their next trip; there is no opportunistic mid-edge U-turn. Input closures that disconnect the graph are legal experiments and create blocked demand rather than invalidating a run.

## Vehicle dynamics and intersection service

Use the Intelligent Driver Model, IDM, for desired longitudinal acceleration. Its role is car following, not collision certification. Chosen profile: length 4.5 m, desired speed equal to lane limit, desired time headway `T=1.2 s`, minimum bumper gap `s0=2 m`, acceleration `a=1.5 m/s²`, comfortable braking `b=2 m/s²`, exponent `delta=4`, and emergency braking limit `6 m/s²`.

```text
closingSpeed = v - vLeader
sStar = s0 + max(0, v*T + v*closingSpeed/(2*sqrt(a*b)))
accelDesired = a * (1 - (v/vDesired)^4 - (sStar/max(gap, 0.001))^2)
accel = clamp(accelDesired, -6, 1.5)
```

With no leader or barrier, omit the gap term. A forbidden stop line is a stationary virtual leader with its front at the line and zero length. A committed connector uses its downstream physical leader; route geometry supplies continuous gaps. Bound the approach target by `min(laneLimit, sqrt(connectorLimit² + 2*b*distanceToConnector))` and enforce connector entry speed in the motion proposal. Apply the most restrictive constraint when a physical leader and stop barrier both exist. Do not apply a new lower speed limit as an instantaneous velocity jump; a required braking rate beyond the emergency limit is a diagnostic.

Integrate with the ballistic scheme. For `v + accel*dt >= 0`, use `distance=v*dt + 0.5*accel*dt²` and `vNext=v+accel*dt`. If braking reaches zero during the step, integrate only to stopping time and set `vNext=0`, avoiding negative distance. Quantize resulting state to the units above. The IDM reference explains both the model and ballistic update; CIVITAS adds quantization and junction safety rules and therefore must be described as an adaptation. See [the model author's IDM description](https://traffic-simulation.de/info/info_IDM.html).

Intersection rules:

1. Each node has approach phases in clockwise N/E/S/W order, omitting absent approaches. North means an arrival from the geographic north. One approach is green at a time, with all its valid non-U-turn movements eligible. Green lasts 120 ticks, amber 30 ticks, and all-red at least 20 ticks. Initial approach and offset are scenario inputs; baseline starts with the first available approach and zero offset. S0 has `remainingTicks=120`; transitions 1–120 use green, 121–150 amber, and 151–170 all-red. A phase with zero remaining ticks is replaced at the start of the next transition; decrement its counter once after that transition's motion. If all-red expires while occupied, hold at zero until the conflict area is clear.
2. Only the foremost unreserved vehicle on an incoming lane may request a token, when its front is within 8 m of the stop line and it has a valid suffix. Candidates sort by `(firstEligibleTick, vehicleId)`. Requests are eligible only during that approach's green.
3. Grant only if the conflict area is unoccupied and unreserved, and the outgoing lane has enough entrance space for vehicle length plus minimum gap. Hold that space against source admission and other transfers. A vehicle cannot enter a connector on a promise of space that has not been reserved.
4. Token ownership removes the virtual stop barrier for its owner. Ownership continues through amber and all-red until the vehicle's rear clears the connector and its outgoing entrance hold is consumed. The next approach cannot turn green before clearance. Unreserved vehicles must stop for amber as well as red; because they never had permission past the line, the barrier was already present.
5. Vehicles already committed may clear an intervention. Log the reservation tick so this exception is auditable. A token owner that cannot move for 100 ticks produces a diagnostic; never expire a token by deleting its vehicle.

Compute all movement proposals from the same pre-transition state. Resolve lane order, connector admission, and footprint conflicts in stable ID order, then commit together. Enforce a non-overlap projection against committed leader rear positions, reserved boundaries, and stop lines. Projection is a numerical safety layer, not a substitute for braking. Count corrections larger than 1 mm and braking demands beyond 6 m/s² as model diagnostics. Normal baseline fixtures must produce zero such diagnostics; a failing model cannot be made to pass by hiding the counters. If an adversarial case requires a safety correction, preserve occupancy and flag it rather than allow a collision.

The deliberately exclusive junction token lowers capacity and may create excess delay compared with a real intersection. Quantify that limitation in later calibration; do not tune the model to fabricate a visually pleasing congestion percentage.

## Transition order

For transition `k`, use the following fixed sequence:

1. Apply accepted domain commands for tick k in sequence order; update entry restrictions and topology version.
2. Clear eligible reservations whose rear already left. Replace an expired signal phase unless all-red must extend for clearance. Establish the active signal state for this transition using the counter convention above.
3. Mark manifest requests with departure tick at or before k as due; preserve per-agent order and all pending requests.
4. Update invalid route suffixes and due blocked-route retries. Existing commitments remain valid under their documented exception.
5. Determine eligible requests and grant junction reservations and outgoing-space holds from the current state. No vehicle uses a reservation granted to somebody else later in the step.
6. Compute acceleration and motion proposals from the same state, enforce footprints and stop boundaries, and commit motion. An agent may cross at most one lane/connector boundary in a step; assert that the geometry/speed/dt combination supports this. Carry excess arc distance across that one boundary.
7. Record arrivals and rear-clearance changes. Attempt source admissions in stable source-lane and queue order, using remaining space. An admitted vehicle starts with zero speed and its full body inside the lane; it first accelerates next transition.
8. Decrement the active signal counter once, to a minimum of zero. Accumulate metric contributions from this transition, update queue-duration counters, and append derived events in `(tick, eventTypePriority, entityId, localOrdinal)` order. This ordering is versioned; phase-change events identify the state used for this transition.
9. Check invariants, increment the authoritative state to k, calculate any scheduled checkpoint/hash, and publish observations when due.

At S0, tick-zero demand is queued but not admitted. Transition 1 admits requests due at 0 or 1. This is the explicit one-tick initial scheduling convention. Its admission wait is included in request-to-arrival time.

## Determinism, events, and replay

The guarantee is **same inputs + same engine build + compatible pinned runtime + same accepted command log = identical authoritative checkpoint hashes and metric output**. Wall scheduling, canvas size, camera, FPS, quality preset, and requested playback speed are excluded. Different seeds must change the manifest; they need not change every aggregate metric.

Floating-point IDM math and square root mean universal bit-for-bit cross-engine equality is not assumed. Record engine build SHA, runtime engine/version, platform, numeric contract version, and input hashes. Stage 01 proves exact replay in its pinned Node and Chromium runtime families separately and reports their comparison. Firefox/WebKit portability is tested; if their hashes differ, mark those artifacts incompatible with exact cross-runtime replay rather than claim equality. An integer-only dynamics revision would be a separate engine version, not a quiet patch.

Canonical hashing uses UTF-8, sorted object keys, stable ID-sorted arrays, integer kinematic values, explicit nulls, and no NaN/infinity. Hash authoritative state with SHA-256 every 100 ticks and at final export. Include signals, reservation/footprint state, agent itinerary cursors, blocked retries, source queues, future accepted commands, topology mode/version, PRNG state, metric accumulators/window rings, derived event sequence, and accepted-command cursor. Checkpoints reference immutable inputs by hash rather than duplicating the full city/manifest, and store the event prefix digest/sequence rather than copying the whole historical event log into each checkpoint. Exclude presentation, wall timers, run UUID, and diagnostic timings. The run UUID identifies storage but cannot prevent equality between repeated runs.

Do not put run-specific metadata into the state comparison hash. Input hashes identify immutable data; checkpoint hashes identify the evolving state. Serialization and hashing operate at observation boundaries; asynchronous completion cannot alter core ordering.

| Artifact section | Required content |
| --- | --- |
| Header | Artifact/schema versions, spec version, build/runtime identity, run/parent identity |
| Inputs | Full city/scenario/manifest and their SHA-256 hashes, seed and generator version |
| Commands | Accepted tick, sequence, command ID, validated payload |
| Derived event log | Tick, sequence, entity, reason, command correlation where relevant |
| Checkpoints | S0 and every 100 ticks; full restore state and hash |
| Metrics | Definition versions, time series, nulls, denominators, windows, quality flags |
| Outcome | Final tick/hash, paused/completed/error status, diagnostics and evidence completeness |

Derived events include trip due/admitted/arrived, source blocked/unblocked, route changed/blocked, signal phase changed, reservation granted/released, closure applied/reopened, and safety diagnostics. They are evidence, not replay instructions; replay consumes initial inputs and accepted commands and regenerates events for comparison. Avoid recording every vehicle pose as an event.

Stage 01 export/import replays from S0. Checkpoint round-trip verification is required internally. Stage 03 seeking restores the nearest verified checkpoint at or before the requested tick, suppresses rendering while advancing exact ticks, and publishes a new epoch once paused at target. Editing at a past tick creates a new branch, preserves the parent artifact, copies its input and command prefix, and discards its later commands. Comparisons must record that lineage.

## Congestion and mobility metrics

Metrics are authoritative reducers, not values inferred from mesh animation. Each sample includes `runId`, `asOfTick`, definition version, scope, unit, window start/end, sample count, value/null, and quality flags. Windows use `(startTick, endTick]` transition intervals. At warm-up, show the actual shorter duration. Never fill undefined values with zero.

| Metric | Exact definition | Presentation |
| --- | --- | --- |
| Fleet / in-network | Fleet is configured agent count; in-network is unique `ON_LANE + ON_CONNECTOR` | Counts with separate labels |
| Source backlog | Number of due requests not yet admitted; split source queued vs waiting for a busy agent; blocked reason separately | Count and oldest request age |
| Lane queue | Vehicles whose primary front is on that lane and speed is below 0.5 m/s for at least ten consecutive ticks | Count; excludes moving slow traffic and connector fronts |
| Network queued share | Unique queued lane vehicles / unique in-network vehicles at the sample tick | Percent; null when in-network is zero; not labeled total congestion |
| Aggregate mean network speed | Sum of actual in-network traveled distance / sum of in-network vehicle-time over trailing 600 ticks, including stopped vehicle-time | km/h, window and vehicle-seconds shown; a generalized space-mean speed, distinct from an unweighted mean of agent speeds |
| Lane flow | Front-bumper crossings of a defined lane exit detector in trailing 600 ticks / actual window seconds * 3600 | veh/h equivalent, explicitly a rolling rate; one crossing per vehicle traversal |
| Trip duration | Arrival tick minus requested departure tick, multiplied by dt | Median/p95 for completed requests in the window, with n; includes source wait |
| Network travel time | Arrival tick minus admission tick, multiplied by dt | Secondary trip detail; distinguishes external wait |
| Delay | Per completed trip: max(0, request-to-arrival duration minus its frozen base-network free-flow reference) | Mean seconds with n, and total delay vehicle-seconds; reference excludes signals |
| Completed throughput | Arrivals in trailing 600 ticks / actual window seconds * 3600 | Completed trips/h equivalent and raw count |
| Unfinished requests | Due requests without arrival at comparison tick | Count, request ages and admission status; mandatory beside completed-trip statistics |
| Congested lane-time share | Eligible lane-ticks whose trailing 100-tick mean speed is below 50% of lane limit / eligible lane-ticks in trailing 600 ticks | Percent; a lane-tick is eligible only if it has positive vehicle-time in its trailing window; show coverage |

In-network vehicle-time uses the fraction of the transition the vehicle actually occupies the network, including a partial final transition. Source admissions occur at the end of a transition and contribute vehicle-time starting next transition. Count lane/connector boundary distance once. Detector events store sub-step crossing fractions where relevant; their enclosing tick determines the rolling window. Compute percentiles using the nearest-rank convention, `rank=ceil(p*n)` on sorted values. No samples means null, and n=1 returns that sample.

Main interface: mean speed, queued count/share, completed count/rate, and source backlog. Delay and duration appear in inspection/comparison with sample sizes. Avoid a single invented city health or congestion score.

For comparisons use the same city version, manifest, initial state, model parameters, duration, and metric windows. The standard experiment runs 9,000 ticks, excludes ticks 1–1,200 as warm-up for experiment summary metrics, closes at tick 3,000 and reopens at tick 6,000. The initial standard seed is `104729`. Pair runs against an empty-intervention baseline; report absolute deltas and percentages only when the baseline denominator is nonzero. Full-MVP automated experiment summaries repeat seeds `104729`, `130363`, and `155921`; they describe model variation, not confidence about a real city.

Compare matched trip IDs where both complete, but always show completion coverage and unmatched/unfinished requests. A road closure can appear to reduce mean completed-trip duration merely because slow trips no longer finish. Do not label that as an improvement. Do not require every closure to worsen every network metric; use controlled fixtures to assert directional effects.

## Energy and pollution boundaries

The MVP collects traffic distance, stopped vehicle-time, and acceleration histories as traffic facts. None is renamed fuel use, CO2, PM2.5, electrical demand, or air quality. Energy and pollution selectors show **Unavailable — model not enabled** and no number.

Future building energy may calculate `P(t)=Pbase + occupancy(t)*Pperson + weatherLoad(t)` in kW and integrate `E += P*dt/3600` in kWh. Each coefficient needs units, provenance, model validity, and a load/occupancy schedule. Building floor area alone cannot establish electrical consumption.

Future vehicle energy/emissions must distinguish propulsion classes, operational conditions, source factors, and cold starts. Pollutant source mass would integrate a documented rate in g/s. Ambient concentration needs a separately validated dispersion and meteorology model, boundary conditions, spatial resolution, and mass balance. It cannot be obtained by recoloring congestion or equating grams emitted with micrograms per cubic meter.

These subsystems are optional versioned consumers of authoritative traffic observations at first. Any feedback into traffic, signal power, occupancy, or demand requires a new coupled-model contract and timestep stability tests. No external paid service is assumed.

## Required invariants and evidence

- Every base lane is reachable from every other legal origin/destination through allowed movements; no dangling IDs or negative/zero traversable lengths.
- Fleet and request conservation hold at every tick; each active trip has exactly one agent.
- No overlapping physical footprints, illegal connector entry, red entry without an earlier valid reservation, negative velocity, or unexplained position discontinuity.
- No newly committed entry to a closed lane; all draining exceptions identify prior commitments.
- Routes are contiguous and avoid closed uncommitted edges; no-route agents remain accounted for.
- Metric integrals agree with independently reconstructed traversal and event records.
- Checkpoint restore plus continued replay agrees with uninterrupted execution.
- Changing renderer, camera, FPS, or execution-speed scheduling changes no authoritative hash for an equal command log.

The exact verification fixtures and thresholds are in [acceptance criteria](acceptance-criteria.md). Any model amendment that changes a reference hash requires a version change and an explanation; never regenerate golden artifacts just to erase a failing test.
