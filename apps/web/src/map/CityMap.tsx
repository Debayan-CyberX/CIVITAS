import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { Model } from '../scene/model';
import { bounds, screen, vehicleId } from '../scene/model';
import { presentation, selectEntity, useCity } from '../state/city';

const choose = (event: KeyboardEvent<SVGElement>, id: string) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    selectEntity(id);
  }
};
export default function CityMap({ model }: { model: Model }) {
  const ref = useRef<SVGSVGElement>(null);
  const selected = useCity((s) => s.selected);
  const tick = useCity((s) => s.tick);
  const intent = useCity((s) => s.camera);
  const mapView = useRef({ x: -115, y: -25, width: 770, height: 590 });
  const last = presentation.snapshots.at(-1);
  useEffect(() => {
    if (!ref.current) return;
    const box = mapView.current;
    if (intent.action === 'reset') Object.assign(box, { x: -115, y: -25, width: 770, height: 590 });
    else if (intent.action === 'in' || intent.action === 'out') {
      const factor = intent.action === 'in' ? 0.8 : 1.25;
      const width = Math.max(60, Math.min(1300, box.width * factor)),
        height = (width * 590) / 770;
      box.x += (box.width - width) / 2;
      box.y += (box.height - height) / 2;
      box.width = width;
      box.height = height;
    } else if (intent.action === 'focus' && intent.id) {
      const node = model.city.nodes.find((n) => n.id === intent.id);
      const polygon =
        model.city.districts.find((d) => d.id === intent.id)?.polygon ??
        model.city.segments.find((s) => s.id === intent.id)?.footprint;
      if (node || polygon) {
        const b = polygon ? bounds(polygon) : null;
        box.width = b && b.depth > 300 ? 600 : 200;
        box.height = (box.width * 590) / 770;
        box.x = (node?.position.eastM ?? b?.x ?? 270) - box.width / 2;
        box.y = 450 - (node?.position.northM ?? b?.n ?? 180) - box.height / 2;
      }
    } else {
      box.x += intent.action === 'left' ? -25 : intent.action === 'right' ? 25 : 0;
      box.y += intent.action === 'up' ? -25 : intent.action === 'down' ? 25 : 0;
    }
    box.x = Math.max(-400, Math.min(800, box.x));
    box.y = Math.max(-400, Math.min(800, box.y));
    ref.current.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
  }, [intent, model]);
  useEffect(() => {
    let frame = 0,
      previous = 0;
    const update = (now: number) => {
      if (now - previous > 80 && ref.current) {
        previous = now;
        const sample = presentation.sample(model, now, useCity.getState().motion);
        const nodes = ref.current.querySelectorAll<SVGGElement>('[data-slot]');
        nodes.forEach((node) => {
          node.style.display = 'none';
        });
        sample?.vehicles.forEach((v) => {
          const node = nodes[v.slot];
          if (!node) return;
          const [x, y] = screen(v);
          node.style.display = '';
          node.setAttribute(
            'transform',
            `translate(${x} ${y}) rotate(${(v.heading * 180) / Math.PI})`,
          );
        });
        ref.current.dataset['visibleVehicles'] = String(sample?.vehicles.length ?? 0);
        ref.current.dataset['viewTick'] = String(sample?.tick ?? 0);
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [model]);
  return (
    <svg
      ref={ref}
      className="city-map"
      viewBox="-115 -25 770 590"
      aria-label="Aster interactive traffic map"
      data-authoritative-tick={tick}
    >
      <title>
        Aster: three districts, seventeen physical roads and twelve signalized junctions
      </title>
      <defs>
        <pattern
          id="closure"
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="2" height="5" fill="#f0a28e" />
        </pattern>
      </defs>
      {model.city.districts.map((d, i) => {
        const b = bounds(d.polygon);
        return (
          <g key={d.id}>
            <rect
              x={b.x0}
              y={450 - b.n0 - b.depth}
              width={b.width}
              height={b.depth}
              fill={['#303f3c', '#3b4340', '#343d39'][i]}
              stroke="#66736b"
              strokeDasharray="3 5"
            />
            <text x={b.x} y={-6} textAnchor="middle" fill="#d8d0bf" fontSize="13">
              {d.name}
            </text>
          </g>
        );
      })}
      {model.city.buildings.map((b) => (
        <polygon
          key={b.id}
          points={b.footprint.map((p) => screen(p).join(',')).join(' ')}
          fill={selected === b.id ? '#d4aa72' : '#6c756c'}
          stroke="#a9ac99"
          strokeWidth="0.5"
          role="button"
          tabIndex={0}
          aria-label={`Building ${b.id}`}
          onKeyDown={(e) => choose(e, b.id)}
          onClick={() => selectEntity(b.id)}
        />
      ))}
      {model.city.segments.map((s) => {
        const footprint = bounds(s.footprint);
        const points = s.endpoints
          .map((id) => screen(model.city.nodes.find((n) => n.id === id)!.position).join(','))
          .join(' ');
        return (
          <g
            key={s.id}
            role="button"
            tabIndex={0}
            aria-label={`Road ${s.id}`}
            onClick={() => selectEntity(s.id)}
            onKeyDown={(e) => choose(e, s.id)}
          >
            <rect
              x={footprint.x0}
              y={450 - footprint.n0 - footprint.depth}
              width={footprint.width}
              height={footprint.depth}
              fill="transparent"
            />
            <polyline
              points={points}
              fill="none"
              stroke={selected === s.id ? '#e3c28e' : '#181e1f'}
              strokeWidth="11"
            />
            <polyline
              points={points}
              fill="none"
              stroke="#b0ada0"
              strokeWidth="0.6"
              strokeDasharray="4 5"
            />
          </g>
        );
      })}
      {model.lanes.map((lane, i) => {
        const queued =
          useCity
            .getState()
            .metrics.find(
              (m) =>
                m.metricId === 'lane_queue' && m.scope.kind === 'LANE' && m.scope.id === lane.id,
            )?.value ?? 0;
        return (
          <g key={lane.id} pointerEvents="none">
            <polyline
              points={lane.centerline.map((p) => screen(p).join(',')).join(' ')}
              stroke={last?.laneClosed[i] ? 'url(#closure)' : queued ? '#d1a36c' : 'transparent'}
              strokeWidth="2.4"
            />
            {last?.laneClosed[i] && (
              <text
                x={screen(lane.centerline[0]!)[0]}
                y={screen(lane.centerline[0]!)[1] - 4}
                fill="#f0a28e"
                fontSize="10"
              >
                ×
              </text>
            )}
          </g>
        );
      })}
      {model.city.nodes.map((node, i) => {
        const [x, y] = screen(node.position),
          signal = last?.signals[i];
        const phase = signal?.[1] === 0 ? 'Green' : signal?.[1] === 1 ? 'Amber' : 'All red';
        return (
          <g
            key={node.id}
            role="button"
            tabIndex={0}
            aria-label={`Junction ${node.id}, ${phase}, ${['north', 'east', 'south', 'west'][signal?.[2] ?? 0]} approach`}
            onKeyDown={(e) => choose(e, node.id)}
            onClick={() => selectEntity(node.id)}
          >
            <circle
              cx={x}
              cy={y}
              r="5"
              fill={signal?.[1] === 0 ? '#a9c3b0' : signal?.[1] === 1 ? '#e3bd7a' : '#f0a28e'}
              stroke={selected === node.id ? '#fff4d8' : '#1d2725'}
              strokeWidth="2"
            />
            <text x={x + 10} y={y - 9} fill="#d7d1c1" fontSize="9">
              {node.id}
            </text>
          </g>
        );
      })}
      {Array.from({ length: last?.agents.length ?? 300 }, (_, slot) => (
        <g
          key={slot}
          data-slot={slot}
          role="button"
          tabIndex={-1}
          aria-label={`Vehicle ${vehicleId(slot, model)}`}
          onClick={() => selectEntity(vehicleId(slot, model))}
          style={{ display: 'none' }}
        >
          <rect
            x="-1.1"
            y="0"
            width="2.2"
            height={(model.vehicleLengthsMm[slot] ?? 4500) / 1000}
            rx="0.5"
            fill={selected === vehicleId(slot, model) ? '#ffd184' : '#ede6ce'}
            stroke="#202a27"
            strokeWidth="0.4"
          />
        </g>
      ))}
      <g fill="#d7d1c1" fontSize="10">
        <path d="M 595 465 v -30 l -4 8 m 4 -8 l 4 8" fill="none" stroke="currentColor" />
        <text x="591" y="480">
          N
        </text>
        <path d="M -65 503 h 100 m -100 -3 v 6 m 100 -6 v 6" stroke="currentColor" />
        <text x="-65" y="523">
          100 m · local metric frame
        </text>
      </g>
    </svg>
  );
}
