# CIVITAS — design system and experience direction

Status: normative art and interaction specification. The Stage 01 application now implements the architectural scene, charcoal/champagne shell, responsive semantic controls and map; [B06–B08 evidence](b06-b08/README.md) records automated checks and measured performance. Formal human art review, assistive-technology review and Stage 02 asset work remain outstanding.

## Creative direction: the city as an architectural instrument

The scene should resemble a carefully lit architectural model with inhabited streets: substantial, tactile, and quiet. Graphite foundations and warm mineral facades sit beneath broad late-afternoon light. A slight atmospheric separation makes distant volumes recede. Cars and signal queues supply movement; the interface makes their causes legible.

The compositional reference is architectural photography and an editorial atlas. Buildings have coherent heights, setbacks, roofs, and street edges. A small set of well-made materials, contact shadows, and accurate scale matters more than texture quantity. Avoid a floating science-fiction platform, emissive road grids, generic blue glass towers, glowing buildings, and decorative particle fields.

Stage 01 establishes spatial readability and functional interaction with simple geometry. Stage 02 delivers the final material, typographic, lighting, and composition work. Both consume the same model geometry and IDs.

## Material and color language

| Token | Value / material | Purpose |
| --- | --- | --- |
| `ink-950` | `#181C1D` | Primary application surfaces, graphite plinth |
| `ink-850` | `#252A2B` | Raised panels and asphalt family |
| `paper-100` | `#ECE6DA` | Primary text and limestone facades |
| `paper-300` | `#B9B1A5` | Secondary text on dark surfaces |
| `mineral-ochre` | `#D4AA72` | Selected entities, primary action, warm sunlight |
| `mineral-clay` | `#BA7D62` | Building material variation, not body text |
| `state-flow` | `#A9C3B0` | Available route / measured low queue state |
| `state-wait` | `#E3BD7A` | Pending operation / measured queuing |
| `state-closed` | `#F0A28E` | Entry restriction / critical action |

Values are proposed tokens. Acceptance requires contrast testing of actual rendered foreground/background pairs, including translucency. Pale text on ink surfaces is the default. Colored text on pale cards needs an independently darkened token. Never assume a material color passes UI contrast.

Facades use roughness around 0.75–0.95 and low metalness; asphalt remains matte. Glazing is dark and restrained, with no expensive transmission required. Vehicle materials use a small warm neutral palette with sufficient separation from asphalt. One selected vehicle receives a clear outline and a DOM inspector, not an exaggerated light source.

Surface variation follows district use and building geometry, with seeded visual variation independent of demand. Road widths, stop lines, signal locations, and connector paths come from the model. Do not reshape roads purely for a camera shot.

## Lighting and atmosphere

Use a single broad directional key, a low-intensity sky/hemisphere fill, and a restrained environment approximation. Warm key light and slightly cool neutral shadow provide depth without orange-and-teal grading. Fix sun direction for the MVP; simulation time is elapsed experiment time, not an implied day/night model.

Standard preset may use one bounded shadow map and modest screen-space ambient occlusion if budgets permit. Reduced uses baked/static contact cues and no screen-space effects. Tone mapping and output color space must be explicit and tested with UI overlays.

Subtle height/distance fog suggests volumetric atmosphere. It is a rendering approximation and communicates depth only. Full ray-marched volumetrics are later research. Fog must never be labeled pollution and must not respond to traffic until a validated concentration model exists. No bloom is needed. No depth of field during inspection; selected objects and stop lines must stay readable. A still promotional capture may use a separate presentation preset outside benchmark claims.

## Typography and layout

Use **Instrument Serif** for large editorial titles and **Inter** for controls, labels, and tabular numerals. Self-host reviewed OFL font files with license copies; no runtime font CDN. Stage 01 may use Georgia and a system sans stack until Stage 02 assets are prepared. Font assets must fit the asset budget and have readable fallbacks. Obtain assets from the [Google Fonts source repository](https://github.com/google/fonts), preserving their individual licenses.

Type scale: 12 px minimum for nonessential annotations, 14–16 px controls and body copy, 20–24 px inspector headings, and 40–56 px opening title on desktop. Critical labels and metric values use at least 14 px. Numerals use tabular figures; every value carries a visible unit. Do not use tiny uppercase text to simulate sophistication.

Use a 4 px spacing base with 8/12/16/24/32 px gaps. Panel corners are restrained, roughly 6–8 px. A 1 px neutral border and subtle elevation distinguish surfaces. Blurred glass is optional and must have an opaque high-contrast fallback. There is no full-screen HUD grid.

Desktop layout:

- A compact header gives city/scenario, seed, model status, and experiment menu.
- The city fills the remaining viewport. A small left mode rail selects City, Map, and entity list.
- A right inspector, up to 320 px, opens only for a selection. It identifies the object, its current evidence, and relevant actions.
- A bottom control strip contains pause/play, single step, speed, exact simulation tick/time, and replay status.
- A compact metric shelf shows at most four primary measures. Definitions and denominators are one action away.

Below 900 px, use a bottom inspector sheet, two visible primary metrics with a route to the full table, and touch targets of at least 44 px. Below 600 px or when performance requires it, default to Map while retaining an explicit City option if WebGL2 is available. At 320 CSS px width and 200% text zoom, controls and evidence must reflow without hiding intervention actions behind horizontal page scrolling.

## Camera system

The camera is a presentation state machine: `OVERVIEW`, `ORBIT`, `FOCUS`, and `FOLLOW`. A mode change never changes simulation state.

| Mode | Behavior |
| --- | --- |
| Overview | Perspective, 35° vertical FOV; initial target near `(270,180)` ground coordinates; approximate 55° elevation and southeast view; fit all district bounds within safe panel margins |
| Orbit | User pan, orbit, and zoom with damping; 25–80° elevation; no roll; ground-plane target clamped to city bounds plus 80 m margin |
| Focus | Frame the selected entity's world bounds with 20% margin, respect inspector occlusion, retain selection when returning to overview |
| Follow | User-requested vehicle follow with a spring-smoothed target and fixed offset; the target follows interpolated snapshots and freezes when evidence is stale |

Use distance limits of 25–1,400 m, near clip about 0.5 m and far clip about 3,000 m, adjusted only if measured precision requires it. Clamp camera height above local buildings where feasible and prevent diving through the ground. These are starting parameters to review in Stage 02, not measured optimal values.

Focus transitions last about 600 ms with a smooth non-bouncing curve; user input immediately cancels the transition. Reduced motion makes focus immediate and removes idle camera motion. There is no automatic orbit or opening fly-through. Optional user-invoked tours may come later and cannot alter playback. A building selection should not force a camera cut unless the user invokes Focus. If a followed agent arrives, hold the last view, announce arrival once, and keep the trip inspector accessible.

## Input and selection

Desktop pointer: left drag orbits; right drag pans; wheel zooms. A click with movement below 4 CSS px selects. Touch: one-finger drag orbits; two-finger drag/pinch pans and zooms. Provide visible directional and zoom controls as alternatives to dragging or multitouch.

Picking resolves an explicit entity ID, including `instanceId -> agentId` mapping. Pick visible vehicles first within their hit shape, then the nearest visible road, then buildings and districts. Do not select roads through buildings. Use a slightly widened invisible road hit target where necessary; geometry used for picking must not change simulation dimensions. Cap hover picking at 15 Hz and disable it on touch. Distinguish pointer hover, keyboard focus, selected state, and closure state.

Selection is singular and persistent by ID. Click empty ground or press Escape to clear selection. Selecting a different view of the same ID preserves its inspector. Selected entities remain selected when offscreen or filtered, with a clear explanation. An arrived vehicle exposes its last trip record rather than silently selecting a reused instance slot.

The entity list is a semantic searchable DOM control with districts, roads, intersections, buildings, and vehicles. Every scene action is also available through this list and inspector. Roving focus/arrow navigation may enhance the list, but standard Tab navigation must remain predictable. Road selection identifies the physical segment, then explicit direction labels choose the intervention target.

Keyboard controls, enabled only outside editable fields and exposed in a help dialog:

| Input | Action |
| --- | --- |
| Tab / Shift+Tab | Traverse semantic controls and entity list |
| Enter | Activate the focused control or choose the focused entity |
| Space | Toggle pause/play when the viewport owns focus |
| Period | Step one tick while paused |
| Arrow keys | Pan the focused viewport; entity-list arrows navigate the list instead |
| Plus / Minus | Zoom while the viewport owns focus |
| F | Focus the selected object |
| Escape | Close the topmost dialog/popover, then clear selection; return focus appropriately |

Provide a setting to disable single-character shortcuts, and do not intercept browser or assistive-technology shortcuts globally. `aria-keyshortcuts` documents actual enabled shortcuts. Avoid a keyboard trap inside the canvas.

## Time and replay controls

Initial load is paused at S0. Controls show authoritative time as `mm:ss.s` plus tick on demand. During running interpolation, a small label distinguishes the buffered view from the authoritative as-of tick. Metrics always display their own as-of time; they do not imply that interpolated positions are exact measurements.

Speeds are 0.25x, 1x, 2x, and 4x. Requested and achieved speed are distinguishable when overloaded. Pause/play, step, and speed changes have pending states until the worker acknowledges them. A step advances exactly one 100 ms transition and displays that snapshot. An intervention applied while paused is queued for the next tick; its pending state must not be mistaken for a completed road closure.

Reset uses the same seed and scenario. If accepted interventions would be lost, offer export and confirm reset in a concrete dialog. Stage 01 exposes JSON export/import and a Replay from start action. Stage 03 adds an accessible timeline with tick-entry alternative and checkpoint seeking. Seeking restores paused; editing a past tick creates a named branch. A simulated elapsed-time clock never claims real local time or a traffic forecast horizon.

## Intervention feedback

The road inspector shows `Open`, `Close pending`, `Closed to new entry — draining`, `Closed to new entry — empty`, or `Reopen pending`. It lists both direction names and whether a command affects one or both. Closing a road is reversible and requires no generic warning dialog in the normal experiment workflow. Disconnecting trips is a supported result, explained after evaluation.

Feedback is tied to acknowledgements and events:

1. Submission creates a pending row with command ID and proposed target. The road receives a restrained dashed amber outline.
2. Acceptance reports the effective tick. On application, short crossbars and a closure pattern appear at entry points, plus a labeled state in the inspector.
3. Existing vehicles and prior commitments drain naturally. The inspector shows their actual count. It never wipes the lane for dramatic effect.
4. Route changes highlight only the selected vehicle's new planned route for about two seconds, or persist on explicit request. Blocking shows its exact reason and decision point.
5. Metric changes appear when their windows update, without canned improvement text. An event row links the command to affected lanes and reroutes.

Use color plus pattern, icons, and text. A closed road has crossbars, not just red asphalt. A queued lane overlay uses bounded segments or ticks corresponding to measured queued agents; a speed overlay states its window and missing-data coverage. Missing observations use a neutral patterned state.

## Evidence presentation

Each metric has a definition popover: unit, numerator, denominator, actual time window, sample count, as-of tick, and model limitation. A tooltip alone is insufficient for keyboard or touch. Empty completed-trip samples show an em dash with “No completed trips in this window,” never zero seconds. Scenario fleet count is labeled an input, not city population.

A comparison view shows baseline and intervention for identical manifest/tick windows, plus unfinished requests and matched-trip coverage. Deltas may be positive, negative, zero, or unavailable. Do not color every lower value green: lower throughput may be worse, lower mean duration may reflect censoring, and blocked trips require explanation. Energy and pollution remain unavailable until their own model gate passes.

## Accessibility and failure states

Target WCAG 2.2 AA for the complete experience. Relevant criteria include text contrast, non-text contrast, keyboard operation, dragging alternatives, visible unobscured focus, and target sizes. CIVITAS adopts 44 px primary action targets, exceeding the 24 px AA minimum where it applies. See the [W3C WCAG 2.2 recommendation](https://www.w3.org/TR/WCAG22/).

Keep functional controls and data in semantic HTML. The canvas has an accessible name and instructions, but a single accessible canvas label does not make city entities accessible; the entity list and Map/table views provide equivalent operations. A screen-reader user must be able to close a named direction, run/step, inspect queue and trip data, and export a run.

Honor `prefers-reduced-motion` plus a user setting. Remove easing, camera follow drift, pulses, and unnecessary transitions; an optional static-symbol view suppresses interpolated vehicle motion while the worker still advances. Updates should not flash. Use polite live announcements for control acknowledgements, selected-object events, and failures, not continuous metric ticks. Tables refresh without moving focus. Provide Pause for ongoing motion and clear stale/unavailable states.

On WebGL2 absence, context loss, low performance, or user choice, Map mode preserves the same experiment and capabilities. SVG roads and direction patterns stay legible in grayscale and forced-colors mode. On unsupported Worker environments, show an explicit unsupported-state explanation and allow imported artifact inspection where feasible; never display invented live traffic. Audio is unnecessary for the MVP.

## Art review checklist

Review overview, close road inspection, night-free neutral presentation, and Map mode at desktop and narrow widths. The city must have a clear silhouette, coherent street sections, visible traffic scale, quiet panels, and a single visual hierarchy. Ask whether every moving or numeric element has a model or interaction reason. Remove elements that cannot answer that question. Performance, accessible operation, and honest evidence are part of the visual quality gate.
