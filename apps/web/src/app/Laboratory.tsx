import { useRef, useState } from 'react';
import { METRIC_DEFINITIONS } from '@civitas/contracts';
import { exportRun, importRun, initialize, replayRun, recoverRun } from '../bridge/application';
import { presentation, selectEntity, useCity } from '../state/city';
import { vehicleId } from '../scene/model';

export function Laboratory() {
  const [tab, setTab] = useState('Explore'),
    [search, setSearch] = useState(''),
    [fleet, setFleet] = useState(200),
    [seed, setSeed] = useState(104729);
  const model = useCity((s) => s.model),
    metrics = useCity((s) => s.metrics),
    events = useCity((s) => s.events),
    busy = useCity((s) => s.busy);
  const quality = useCity((s) => s.quality),
    debug = useCity((s) => s.debug),
    motion = useCity((s) => s.motion),
    shortcuts = useCity((s) => s.shortcuts);
  const fileInput = useRef<HTMLInputElement>(null);
  const snapshot = presentation.snapshots.at(-1);
  const entities = model
    ? [
        ...model.city.districts.map((d) => ({ id: d.id, label: d.name, type: 'District' })),
        ...model.city.segments.map((s) => ({
          id: s.id,
          label: s.endpoints.join(' ↔ '),
          type: 'Road',
        })),
        ...model.city.nodes.map((n) => ({ id: n.id, label: n.id, type: 'Junction' })),
        ...model.city.buildings.map((b) => ({ id: b.id, label: b.id, type: 'Building' })),
        ...(snapshot?.agents ?? []).map((a) => ({
          id: vehicleId(a[0], model),
          label: `${vehicleId(a[0], model)} · ${['parked', 'source queued', 'on lane', 'on connector'][a[1]]}`,
          type: 'Vehicle',
        })),
      ]
    : [];
  return (
    <div className="laboratory">
      <div className="subnav" aria-label="Laboratory views">
        {['Explore', 'Evidence', 'Events', 'Experiment', 'Display'].map((name) => (
          <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>
            {name}
          </button>
        ))}
      </div>
      {tab === 'Explore' && (
        <>
          <label className="field">
            Find an entity
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Road, junction, district, vehicle…"
            />
          </label>
          <p className="muted">
            All scene selections have a keyboard equivalent here. Decorative buildings are excluded.
          </p>
          <div className="entity-list">
            {entities
              .filter((e) =>
                `${e.id} ${e.label} ${e.type}`.toLowerCase().includes(search.toLowerCase()),
              )
              .map((e) => (
                <button key={e.id} onClick={() => selectEntity(e.id)}>
                  <span>
                    <small>{e.type}</small>
                    {e.label}
                  </span>
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
          </div>
        </>
      )}
      {tab === 'Evidence' && (
        <>
          <h3>Measurements, with their limits.</h3>
          <p>
            Every reading comes from the authoritative reducer. Completed-trip durations describe
            completed requests only; unfinished demand is excluded from those samples.
          </p>
          <div className="table-scroll">
            <table>
              <caption>Worker metric samples</caption>
              <thead>
                <tr>
                  <th>Metric / scope</th>
                  <th>Value</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m, i) => (
                  <tr key={i}>
                    <th scope="row">
                      {m.metricId.replaceAll('_', ' ')}
                      <small>
                        {m.scope.kind}
                        {'id' in m.scope ? ` · ${m.scope.id}` : ''} · {m.statistic}
                      </small>
                    </th>
                    <td>
                      {m.value === null ? '—' : Number(m.value.toFixed(2))} {m.unit}
                    </td>
                    <td>
                      <details>
                        <summary>
                          tick {m.asOfTick} · n={m.sampleCount}
                        </summary>
                        <p>
                          {m.definitionVersion} · window ({m.windowStartTick}, {m.windowEndTick}] ·
                          denominator {m.denominator}
                        </p>
                        <p>{METRIC_DEFINITIONS.find((d) => d.id === m.metricId)?.numerator}</p>
                        <p>
                          Denominator:{' '}
                          {METRIC_DEFINITIONS.find((d) => d.id === m.metricId)?.denominator}
                        </p>
                        <p>{m.qualityFlags.join(', ') || 'Available'}</p>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="unavailable">
            Pollution, energy, population and AI recommendations are unavailable. Baseline
            comparison awaits matched experimental runs.
          </p>
        </>
      )}
      {tab === 'Events' && (
        <>
          <h3>The causal record.</h3>
          <p className="muted">
            Last {events.length} events shown. Export retains the full worker event log.
          </p>
          <ol className="event-list">
            {[...events].reverse().map((e) => (
              <li key={e.seq}>
                <time>t{e.tick}</time>
                <div>
                  <strong>{e.type.replaceAll('_', ' ').toLowerCase()}</strong>
                  <button className="text-button" onClick={() => selectEntity(e.entityId)}>
                    {e.entityId}
                  </button>
                  {e.reason && <small>{e.reason}</small>}
                  {e.commandId && <small>command {e.commandId}</small>}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {tab === 'Experiment' && (
        <>
          <h3>One city. Reproducible questions.</h3>
          <label className="field">
            Scenario
            <select disabled>
              <option>Aster morning · v1</option>
            </select>
          </label>
          <label className="field">
            Configured vehicle agents
            <select value={fleet} onChange={(e) => setFleet(Number(e.target.value))}>
              {[100, 200, 300].map((v) => (
                <option key={v} value={v}>
                  {v} vehicles
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Validated seed
            <select value={seed} onChange={(e) => setSeed(Number(e.target.value))}>
              {[104729, 130363, 155921].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <p className="muted">
            Restart replaces the current experiment. Export first to retain its interventions and
            observations.
          </p>
          <button className="primary" disabled={busy} onClick={() => void initialize(fleet, seed)}>
            Start new experiment
          </button>
          <hr />
          <button disabled={busy} onClick={() => void exportRun()}>
            Export verified run
          </button>
          <button disabled={busy} onClick={() => fileInput.current?.click()}>
            Import run JSON
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importRun(file);
              e.target.value = '';
            }}
          />
          <button disabled={busy} onClick={() => void replayRun()}>
            Verify replay from origin
          </button>
          <p className="muted">
            Replay verifies all transitions from S0 and restores the exported endpoint paused.
            Animated seeking and branching are future features. Exact import requires a compatible
            engine build and runtime.
          </p>
          <button disabled={busy} onClick={() => void recoverRun()}>
            Recover last exported run
          </button>
        </>
      )}
      {tab === 'Display' && (
        <>
          <h3>Clarity is a setting.</h3>
          <label className="field">
            City quality
            <select
              value={quality}
              onChange={(e) =>
                useCity.setState({ quality: e.target.value as 'standard' | 'reduced' })
              }
            >
              <option value="standard">Standard · DPR up to 1.5</option>
              <option value="reduced">Reduced · DPR 1, no shadows</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={debug}
              onChange={(e) => useCity.setState({ debug: e.target.checked })}
            />
            Authoritative geometry only
          </label>
          <p className="muted">
            Hides visual dressing. Teal lane centerlines and champagne connectors identify the
            simulation graph. The 48 model buildings remain.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={motion}
              onChange={(e) => useCity.setState({ motion: e.target.checked })}
            />
            Reduced motion / static snapshot symbols
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={shortcuts}
              onChange={(e) => useCity.setState({ shortcuts: e.target.checked })}
            />
            Viewport keyboard shortcuts
          </label>
          <p>
            When the city viewport has focus: Space plays or pauses; period steps; arrows pan; + / −
            zoom; F focuses selection; Escape clears selection. Inputs retain their normal keyboard
            behavior.
          </p>
          <p className="unavailable">
            Atmosphere and decorative architecture are visual context. They add no traffic routes,
            buildings to model totals, population or air-quality readings.
          </p>
        </>
      )}
    </div>
  );
}
