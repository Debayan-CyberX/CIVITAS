import { useEffect } from 'react';
import { inspect, intervene } from '../bridge/application';
import { bounds, vehicleId } from '../scene/model';
import { cameraAction, presentation, selectEntity, useCity } from '../state/city';

export function Inspector() {
  const id = useCity((s) => s.selected),
    model = useCity((s) => s.model),
    tick = useCity((s) => s.tick);
  const details = useCity((s) => s.details),
    busy = useCity((s) => s.busy),
    accepted = useCity((s) => s.accepted);
  const metrics = useCity((s) => s.metrics);
  const detailTick = Math.floor(tick / 10);
  useEffect(() => {
    if (id) void inspect(id);
  }, [id, detailTick]);
  if (!id || !model) return null;
  const road = model.city.segments.find(
    (s) => s.id === id || s.laneIds.some((lane) => lane === id),
  );
  const node = model.city.nodes.find((n) => n.id === id);
  const building = model.city.buildings.find((b) => b.id === id);
  const district = model.city.districts.find((d) => d.id === id);
  const snapshot = presentation.snapshots.at(-1);
  const vehicle = snapshot?.agents.find((a) => vehicleId(a[0], model) === id);
  const signal = node
    ? snapshot?.signals[model.city.intersections.findIndex((j) => j.nodeId === node.id)]
    : null;
  const pending = accepted.filter((c) => c.acceptedTick > tick);
  return (
    <aside className="inspector panel" aria-label="Entity inspector">
      <div className="panel-heading">
        <span className="eyebrow">
          {road
            ? 'Street / intervention'
            : node
              ? 'Junction / signal'
              : vehicle
                ? 'Agent / observation'
                : building
                  ? 'Building / static model'
                  : 'District / observation'}
        </span>
        <button
          className="icon-button"
          aria-label="Close inspector"
          onClick={() => selectEntity(null)}
        >
          ×
        </button>
      </div>
      <h2>{district?.name ?? id}</h2>
      <p className="muted">
        {road
          ? 'Directional entry control. Existing occupants and reservations drain naturally.'
          : node
            ? 'Exclusive junction ownership. One reserved vehicle at a time.'
            : vehicle
              ? 'Finite vehicle agent. Movement is owned by the simulation worker.'
              : building
                ? `${building.use.toLowerCase()} · ${building.floors} floors · ${(building.floorHeightM * building.floors).toFixed(1)} m`
                : district?.landUse.toLowerCase()}
      </p>
      <button className="text-button" onClick={() => cameraAction('focus', id)}>
        Focus in city <span aria-hidden="true">↗</span>
      </button>
      {road && (
        <div className="directions">
          {road.laneIds.map((laneId) => {
            const lane = model.lanes.find((l) => l.id === laneId)!;
            const index = model.lanes.indexOf(lane),
              closed = snapshot?.laneClosed[index] ?? false;
            const occupancy =
              snapshot?.agents.filter((a) => a[1] === 2 && a[2] === index).length ?? 0;
            const waiting = pending.find((c) => c.intervention.laneIds.includes(laneId));
            const queue = metrics.find(
              (m) =>
                m.metricId === 'lane_queue' && m.scope.kind === 'LANE' && m.scope.id === laneId,
            );
            return (
              <section className="direction" key={laneId}>
                <h3>
                  {lane.fromNodeId} → {lane.toNodeId}
                </h3>
                <p className={closed ? 'warning' : 'live'}>
                  {waiting
                    ? `${waiting.intervention.type === 'CLOSE_LANES' ? 'Close' : 'Reopen'} pending · tick ${waiting.acceptedTick}`
                    : closed
                      ? `Closed to new entry · ${occupancy ? 'draining' : 'empty'}`
                      : 'Open to entry'}
                </p>
                <p>
                  {occupancy} on lane · {queue?.value ?? '—'} queued
                </p>
                <button
                  disabled={busy || !!waiting}
                  onClick={() => void intervene([laneId], !closed)}
                >
                  {closed ? 'Reopen' : 'Close'} {lane.fromNodeId} → {lane.toNodeId}
                </button>
              </section>
            );
          })}
          <div className="button-pair">
            <button
              disabled={busy || !!pending.length}
              onClick={() => void intervene([...road.laneIds], true)}
            >
              Close both
            </button>
            <button
              disabled={busy || !!pending.length}
              onClick={() => void intervene([...road.laneIds], false)}
            >
              Open both
            </button>
          </div>
          <small>
            Closures affect new entry. Lane counts exclude bodies whose fronts have reached a
            connector. Prior reservations can still enter.
          </small>
        </div>
      )}
      {node && signal && (
        <dl className="facts">
          <dt>Current phase</dt>
          <dd>{['Green', 'Amber', 'All red'][signal[1]]}</dd>
          <dt>Served approach</dt>
          <dd>{['North', 'East', 'South', 'West'][signal[2]]}</dd>
          <dt>Remaining phase</dt>
          <dd>{(signal[3] / 10).toFixed(1)} s</dd>
          <dt>Incoming directions</dt>
          <dd>{node.incomingLaneIds.length}</dd>
        </dl>
      )}
      {node && (
        <p className="unavailable">
          Signal timing intervention is unavailable in this command contract.
        </p>
      )}
      {vehicle && (
        <dl className="facts">
          <dt>Current state</dt>
          <dd>
            {['Parked / between trips', 'Source queued', 'On lane', 'On connector'][vehicle[1]]}
          </dd>
          <dt>Speed</dt>
          <dd>{(vehicle[4] * 0.0036).toFixed(1)} km/h</dd>
          <dt>Current edge</dt>
          <dd>
            {vehicle[1] >= 2
              ? (vehicle[1] === 2 ? model.lanes : model.movements)[vehicle[2]]?.id
              : 'Outside network'}
          </dd>
        </dl>
      )}
      {building && (
        <dl className="facts">
          <dt>District</dt>
          <dd>{model.city.districts.find((d) => d.id === building.districtId)?.name}</dd>
          <dt>Footprint</dt>
          <dd>
            {bounds(building.footprint).width} × {bounds(building.footprint).depth} m
          </dd>
          <dt>Demand gateway</dt>
          <dd>{building.gatewayNodeId}</dd>
        </dl>
      )}
      {district && (
        <div className="district-readings">
          {metrics
            .filter((m) => m.scope.kind === 'DISTRICT' && m.scope.id === district.id)
            .map((m) => (
              <p key={m.metricId}>
                {m.metricId.replaceAll('_', ' ')}{' '}
                <strong>
                  {m.value === null ? '—' : m.value.toFixed(1)} {m.unit}
                </strong>
                <small>
                  n={m.sampleCount} · tick {m.asOfTick} · window ({m.windowStartTick},{' '}
                  {m.windowEndTick}] · {m.definitionVersion} · denominator{' '}
                  {m.denominator.toFixed(2)}
                </small>
              </p>
            ))}
        </div>
      )}
      {details?.id === id && details.facts.length > 0 && (
        <details open={!!vehicle}>
          <summary>Worker facts · tick {details.tick}</summary>
          <ul className="worker-facts">
            {details.facts.map((fact, i) => (
              <li key={i}>{fact}</li>
            ))}
          </ul>
        </details>
      )}
      <small className="as-of">Authoritative observation · tick {tick}</small>
    </aside>
  );
}
