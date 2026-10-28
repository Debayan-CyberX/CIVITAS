import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { command, disposeApplication, exportRun, initialize } from '../bridge/application';
import { cameraAction, mapFallback, presentation, selectEntity, useCity } from '../state/city';
import { Inspector } from './Inspector';
import { Laboratory } from './Laboratory';
import CityMap from '../map/CityMap';

const CityScene = lazy(() => import('../scene/CityScene'));
const clock = (tick: number) =>
  `${Math.floor(tick / 600)
    .toString()
    .padStart(2, '0')}:${((tick % 600) / 10).toFixed(1).padStart(4, '0')}`;
function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas'),
      context = canvas.getContext('webgl2');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
function Icon({ name }: { name: 'city' | 'map' | 'lab' | 'reset' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      {name === 'city' ? (
        <path d="M3 21V9h6v12m0 0V3h7v18m0 0V12h5v9M1 21h22M12 7h1m-1 4h1m-1 4h1" />
      ) : name === 'map' ? (
        <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16" />
      ) : name === 'lab' ? (
        <path d="M8 3h8m-6 0v7L4 20h16l-6-10V3M7 15h10" />
      ) : (
        <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />
      )}
    </svg>
  );
}

function MetricsShelf() {
  const metrics = useCity((s) => s.metrics),
    completed = useCity((s) => s.completed);
  const tick = useCity((s) => s.tick);
  const samples = [
    'in_network',
    'network_mean_speed',
    'completed_throughput',
    'unfinished_requests',
  ].map((id) => metrics.find((m) => m.metricId === id && m.scope.kind === 'NETWORK'));
  return (
    <div className="metric-shelf" aria-label="Network measurements">
      {['In network', 'Mean network speed', 'Completed throughput', 'Unfinished requests'].map(
        (label, i) => {
          const m = samples[i];
          return (
            <details className="metric" key={label}>
              <summary>
                <span>{label}</span>
                <strong>
                  {m?.value === null || m?.value === undefined
                    ? '—'
                    : Number(m.value.toFixed(i === 1 ? 1 : 0))}
                  <small>
                    {m?.unit === 'count' ? (i === 0 ? 'vehicles' : 'requests') : m?.unit}
                  </small>
                </strong>
              </summary>
              <div className="metric-definition">
                <p>
                  {label} · {m?.definitionVersion ?? 'Awaiting worker'}
                </p>
                {m && (
                  <>
                    <p>
                      As of tick {m.asOfTick} · window ({m.windowStartTick}, {m.windowEndTick}]
                    </p>
                    <p>
                      Sample count {m.sampleCount} · denominator {m.denominator}
                    </p>
                    <p>{m.qualityFlags.join(', ') || 'Available'}</p>
                  </>
                )}
                <p>
                  {completed} completed since origin; {samples[3]?.value ?? '—'} unfinished due
                  requests. Completed statistics exclude unfinished trips.
                </p>
                <small>Viewport observation at tick {tick}.</small>
              </div>
            </details>
          );
        },
      )}
    </div>
  );
}

export function App() {
  const model = useCity((s) => s.model),
    ready = useCity((s) => s.ready),
    mode = useCity((s) => s.mode),
    speed = useCity((s) => s.speed),
    tick = useCity((s) => s.tick),
    horizon = useCity((s) => s.horizon),
    view = useCity((s) => s.view),
    busy = useCity((s) => s.busy),
    notice = useCity((s) => s.notice),
    error = useCity((s) => s.error),
    graphics = useCity((s) => s.graphics),
    selected = useCity((s) => s.selected),
    failed = useCity((s) => s.failed),
    achieved = useCity((s) => s.achieved),
    lag = useCity((s) => s.lag);
  const [laboratory, setLaboratory] = useState(false),
    [stale, setStale] = useState(false),
    [webgl] = useState(supportsWebGL),
    [confirmReset, setConfirmReset] = useState(false);
  const metrics = useCity((s) => s.metrics);
  const dialog = useRef<HTMLDialogElement>(null),
    resetButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    void initialize();
    return disposeApplication;
  }, []);
  useEffect(() => {
    if (!webgl)
      mapFallback('WebGL2 is unavailable. The independent map retains all simulation controls.');
  }, [webgl]);
  useEffect(() => {
    const interval = setInterval(
      () =>
        setStale(
          presentation.running &&
            performance.now() - presentation.receivedAt > Math.max(600, 400 / presentation.speed),
        ),
      300,
    );
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (confirmReset) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [confirmReset]);
  const snapshot = presentation.snapshots.at(-1),
    source = snapshot?.agents.filter((a) => a[1] === 1).length ?? 0;
  const backlog = metrics.find(
    (m) => m.metricId === 'source_backlog' && m.scope.kind === 'NETWORK',
  );
  const toggle = () => void command({ type: mode === 'PAUSED' ? 'PLAY' : 'PAUSE' });
  return (
    <main
      className={`application ${selected ? 'has-selection' : ''} ${laboratory ? 'has-laboratory' : ''}`}
    >
      <header className="topbar">
        <a href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          <h1>CIVITAS</h1>
        </a>
        <span className="brand-subtitle">THE LIVING CITY</span>
        <span className="header-divider" />
        <div className="city-name">
          Aster <span>Fictional city / v1</span>
        </div>
        <nav aria-label="Workspace">
          <button
            className={view === 'city' ? 'active' : ''}
            aria-pressed={view === 'city'}
            disabled={!webgl}
            onClick={() => useCity.setState({ view: 'city', graphics: '' })}
          >
            <Icon name="city" />
            City
          </button>
          <button
            className={view === 'map' ? 'active' : ''}
            aria-pressed={view === 'map'}
            onClick={() => useCity.setState({ view: 'map' })}
          >
            <Icon name="map" />
            Map
          </button>
          <button
            className={laboratory ? 'active' : ''}
            aria-pressed={laboratory}
            onClick={() => setLaboratory(!laboratory)}
          >
            <Icon name="lab" />
            Laboratory
          </button>
        </nav>
        <div className="local-badge">
          <span className={ready && !failed ? 'status-dot' : 'status-dot idle'} />
          {failed ? 'Worker failed' : ready ? 'Local engine' : 'Connecting'}
        </div>
        <button
          className="export-button"
          disabled={!ready || busy}
          onClick={() => void exportRun()}
        >
          Export run <span aria-hidden="true">↗</span>
        </button>
      </header>

      <section className="world" aria-label="City workspace">
        <div
          className="viewport"
          tabIndex={0}
          aria-label={`${view === 'city' ? '3D city' : '2D map'} viewport. Space to play or pause, period to step. Explore entities in Laboratory.`}
          onKeyDown={(e) => {
            if (
              !useCity.getState().shortcuts ||
              e.target !== e.currentTarget ||
              e.altKey ||
              e.ctrlKey ||
              e.metaKey
            )
              return;
            const movements = {
              ArrowUp: 'up',
              ArrowDown: 'down',
              ArrowLeft: 'left',
              ArrowRight: 'right',
              '+': 'in',
              '=': 'in',
              '-': 'out',
              f: 'focus',
              F: 'focus',
            } as const;
            if (e.key in movements) {
              e.preventDefault();
              cameraAction(movements[e.key as keyof typeof movements]);
            } else if (e.key === 'Escape') selectEntity(null);
            else if (ready && !busy && e.key === ' ') {
              e.preventDefault();
              toggle();
            } else if (ready && !busy && e.key === '.' && mode === 'PAUSED') {
              e.preventDefault();
              void command({ type: 'STEP' });
            }
          }}
        >
          {model ? (
            view === 'city' && webgl ? (
              <Suspense
                fallback={<div className="loading-state">Preparing the architectural view…</div>}
              >
                <CityScene model={model} />
              </Suspense>
            ) : (
              <CityMap model={model} />
            )
          ) : (
            <div className="loading-state">
              <span className="brand-mark">C</span>
              <p>{error || 'Preparing Aster, one street at a time.'}</p>
              {error && <button onClick={() => void initialize()}>Retry connection</button>}
            </div>
          )}
        </div>

        {!laboratory && (
          <div className="city-overview">
            <p className="eyebrow">
              LOCAL URBAN OBSERVATORY <span>01 / ASTER</span>
            </p>
            <h2>
              A city in
              <br />
              <em>motion.</em>
            </h2>
            <p className="overview-copy">
              Explore the streets.
              <br />
              Understand what moves them.
            </p>
            <div className="city-facts">
              <span>3 districts</span>
              <span>17 streets</span>
              <span>48 model buildings</span>
            </div>
            <div className="district-list" aria-label="District focus">
              {model?.city.districts.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => {
                    selectEntity(d.id);
                    cameraAction('focus', d.id);
                  }}
                >
                  <span className={`district-index district-${i}`}>0{i + 1}</span>
                  <span>{d.name}</span>
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
            <p className="model-note">
              Deterministic traffic model
              <br />
              Visual dressing adds no traffic routes.
            </p>
          </div>
        )}

        <div className="view-caption">
          <span className="status-dot" />
          <span>{view === 'city' ? 'ARCHITECTURAL VIEW' : 'NETWORK MAP'}</span>
          <span className="caption-secondary">
            LOCAL METRIC FRAME · {view === 'city' ? 'PERSPECTIVE' : 'NORTH UP'}
          </span>
        </div>
        <div className="orientation" aria-hidden="true">
          <span>N</span>
          <svg width="46" height="46" viewBox="0 0 46 46">
            <circle cx="23" cy="23" r="21" fill="none" stroke="currentColor" opacity=".4" />
            <path d="m23 9 5 22-5-4-5 4Z" fill="currentColor" />
          </svg>
        </div>
        <div className="camera-tools" aria-label="Viewport navigation">
          {(['in', 'out', 'up', 'down', 'left', 'right', 'reset'] as const).map((action, i) => (
            <button
              key={action}
              aria-label={
                [
                  'Zoom in',
                  'Zoom out',
                  'Pan north',
                  'Pan south',
                  'Pan west',
                  'Pan east',
                  'Reset camera',
                ][i]
              }
              onClick={() => cameraAction(action)}
            >
              {['+', '−', '↑', '↓', '←', '→', '⌂'][i]}
            </button>
          ))}
        </div>
        {graphics && <div className="graphics-notice">{graphics}</div>}
        {stale && (
          <div className="stale-notice">
            Snapshots delayed · view frozen at last available evidence.
          </div>
        )}
        {laboratory && (
          <aside className="laboratory-panel panel" aria-label="Simulation laboratory">
            <div className="panel-heading">
              <span className="eyebrow">THE SIMULATION LAB</span>
              <button
                className="icon-button"
                aria-label="Close laboratory"
                onClick={() => setLaboratory(false)}
              >
                ×
              </button>
            </div>
            <Laboratory />
          </aside>
        )}
        <Inspector />
        <div className="scene-legend">
          <span>
            <i className="legend-flow" />
            Live signal
          </span>
          <span>
            <i className="legend-queue" />
            Measured queue
          </span>
          <span>
            <i className="legend-closed" />
            Closed entry
          </span>
        </div>
      </section>

      <footer className="experiment-console">
        <MetricsShelf />
        <div className="transport">
          <div className="playback">
            <button
              className="play-button"
              disabled={!ready || busy || failed || tick >= horizon}
              onClick={toggle}
              aria-label={mode === 'PAUSED' ? 'Play simulation' : 'Pause simulation'}
            >
              <span aria-hidden="true">{mode === 'PAUSED' ? '▶' : 'Ⅱ'}</span>
              {mode === 'PAUSED' ? 'Play' : 'Pause'}
            </button>
            <button
              disabled={!ready || busy || failed || mode !== 'PAUSED' || tick >= horizon}
              onClick={() => void command({ type: 'STEP' })}
              aria-label="Step one tick"
            >
              Step <span aria-hidden="true">›|</span>
            </button>
            <button
              ref={resetButton}
              className="icon-button"
              disabled={!ready || busy || failed}
              aria-label="Reset experiment"
              onClick={() => {
                if (tick > 0 || useCity.getState().accepted.length) setConfirmReset(true);
                else void command({ type: 'RESET' });
              }}
            >
              <Icon name="reset" />
            </button>
          </div>
          <div className="simulation-clock">
            <strong data-testid="simulation-clock">{clock(tick)}</strong>
            <span data-testid="run-state">
              {busy
                ? 'Pending acknowledgement'
                : `${mode === 'RUNNING' ? 'Running · buffered view' : 'Paused · exact snapshot'} · tick ${tick}`}
            </span>
          </div>
          <div
            className="timeline"
            aria-label={`Elapsed ${clock(tick)} of ${clock(horizon)} simulation time`}
          >
            <span>00:00</span>
            <div className="timeline-track">
              <i style={{ width: `${(tick / horizon) * 100}%` }} />
            </div>
            <span>{clock(horizon)}</span>
          </div>
          <label className="speed-control">
            Speed
            <select
              aria-label="Simulation speed"
              value={speed}
              disabled={!ready || busy || failed}
              onChange={(e) =>
                void command({
                  type: 'SET_SPEED',
                  speed: Number(e.target.value) as 0.25 | 1 | 2 | 4,
                })
              }
            >
              {[0.25, 1, 2, 4].map((v) => (
                <option key={v} value={v}>
                  {v}×
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="console-meta">
          <p>
            <span className="status-dot" />
            {busy ? 'Awaiting worker' : notice}
          </p>
          <span>
            {source} source queued (t{tick}) · {backlog?.value ?? '—'} not admitted (t
            {backlog?.asOfTick ?? '—'})
            {mode === 'RUNNING' && achieved !== null
              ? ` · achieved ${achieved.toFixed(2)}× · ${lag} lag ticks`
              : ''}
          </span>
        </div>
        <div className="sr-only" aria-live="polite">
          {notice}
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button onClick={() => useCity.setState({ error: '' })} aria-label="Dismiss error">
              ×
            </button>
            {failed && <button onClick={() => setLaboratory(true)}>Open recovery controls</button>}
          </div>
        )}
      </footer>
      <dialog
        ref={dialog}
        aria-labelledby="reset-title"
        onCancel={() => setConfirmReset(false)}
        onClose={() => {
          setConfirmReset(false);
          resetButton.current?.focus();
        }}
      >
        <h2 id="reset-title">Return this experiment to origin?</h2>
        <p>
          Reset removes this run’s interventions and observations. Export retains a reproducible
          copy.
        </p>
        <div className="button-pair">
          <button onClick={() => setConfirmReset(false)} autoFocus>
            Keep experiment
          </button>
          <button onClick={() => void exportRun()}>Export first</button>
          <button
            className="primary"
            onClick={() => {
              setConfirmReset(false);
              void command({ type: 'RESET' });
            }}
          >
            Reset to origin
          </button>
        </div>
      </dialog>
    </main>
  );
}
