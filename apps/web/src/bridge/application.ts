import {
  CityDefinitionSchema,
  DemandManifestSchema,
  ScenarioSchema,
  LIMITS,
} from '@civitas/contracts';
import type { EngineArtifact, EngineCommand, EngineObservation } from '@civitas/contracts';
import { SimulationClient } from './simulation-client';
import { presentation, useCity } from '../state/city';
import { presentationModel } from '../scene/model';

let client: SimulationClient | null = null;
let disposeSubscription: (() => void) | null = null;
let commandSerial = 0;
let lastArtifact: string | null = null;
let generation = 0;
let lifecycleTick = 0;
type Request<T = EngineCommand> = T extends EngineCommand
  ? Omit<T, 'protocolVersion' | 'runId' | 'epoch' | 'requestId'>
  : never;
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

function observe(m: Parameters<Parameters<SimulationClient['subscribe']>[0]>[0]) {
  switch (m.type) {
    case 'READY':
    case 'RESTORED':
      lifecycleTick = m.snapshot.tick;
      presentation.reset();
      presentation.push(m.snapshot, performance.now());
      useCity.setState({
        ready: true,
        failed: false,
        tick: m.snapshot.tick,
        mode: 'PAUSED',
        speed: 1,
        metrics: [],
        events: [],
        accepted: [],
        completed: 0,
        details: null,
        error: '',
        notice:
          m.type === 'READY'
            ? 'Experiment ready · paused at origin.'
            : `Restored paused at tick ${m.snapshot.tick}.`,
      });
      break;
    case 'SNAPSHOT':
      presentation.push(m.snapshot, performance.now());
      useCity.setState({ tick: m.snapshot.tick });
      break;
    case 'METRICS':
      useCity.setState({ metrics: m.samples });
      break;
    case 'EVENT_BATCH':
      presentation.addEvents(m.events);
      useCity.setState((s) => ({
        events: [...s.events, ...m.events].slice(-300),
        completed: s.completed + m.events.filter((e) => e.type === 'TRIP_ARRIVED').length,
      }));
      for (const event of m.events)
        if (
          event.tick > lifecycleTick &&
          (event.type === 'CLOSURE_APPLIED' || event.type === 'LANE_REOPENED')
        )
          useCity.setState({
            notice: `${event.entityId}: ${event.type === 'CLOSURE_APPLIED' ? 'closed to new entry' : 'reopened'} at tick ${event.tick}.`,
          });
      break;
    case 'CONTROL_ACK':
      presentation.running = m.mode === 'RUNNING';
      presentation.speed = m.requestedSpeed;
      useCity.setState({
        mode: m.mode,
        speed: m.requestedSpeed,
        tick: m.authoritativeTick,
        notice: `${m.mode === 'RUNNING' ? 'Playing' : 'Paused'} · tick ${m.authoritativeTick} · ${m.requestedSpeed}×`,
      });
      break;
    case 'COMMAND_ACK':
      useCity.setState((s) => ({
        accepted: [...s.accepted.filter((a) => a.commandId !== m.command.commandId), m.command],
        notice: `Accepted ${m.command.commandId} · effective tick ${m.command.acceptedTick}${s.mode === 'PAUSED' ? ' · step or play to apply' : ''}.`,
      }));
      break;
    case 'DETAILS':
      if (useCity.getState().selected === m.entityId)
        useCity.setState({ details: { id: m.entityId, tick: m.asOfTick, facts: m.facts } });
      break;
    case 'STATUS':
      useCity.setState({ achieved: m.achievedSpeed, lag: m.lagTicks });
      if (m.reason) useCity.setState({ notice: m.reason });
      break;
    case 'ERROR':
      presentation.running = false;
      useCity.setState({ mode: 'PAUSED', error: m.reason, failed: m.code === 'INTERNAL_ERROR' });
      break;
    case 'COMMAND_REJECTED':
      useCity.setState({ error: m.reason });
      break;
    case 'ARTIFACT':
      break;
  }
}
export async function command(input: Request): Promise<EngineObservation | null> {
  if (!client) {
    useCity.setState({ error: 'Local worker unavailable. Reload or restart to retry.' });
    return null;
  }
  useCity.setState({ busy: true, error: '' });
  try {
    return await client.request(input);
  } catch (error) {
    useCity.setState({ error: reason(error) });
    return null;
  } finally {
    useCity.setState({ busy: false });
  }
}
export async function initialize(fleet = 200, seed = 104729) {
  const ownGeneration = ++generation;
  disposeSubscription?.();
  client?.dispose();
  client = null;
  presentation.reset();
  useCity.setState({
    ready: false,
    failed: false,
    busy: true,
    mode: 'PAUSED',
    error: '',
    notice: 'Validating Aster inputs…',
    selected: null,
  });
  try {
    if (typeof Worker === 'undefined')
      throw new Error('Local worker unavailable. This browser does not support dedicated workers.');
    const response = await fetch(`/inputs/${fleet}-${seed}.json`);
    if (!response.ok)
      throw new Error('The bundled scenario could not load. Run npm run inputs:build and retry.');
    const raw = (await response.json()) as Record<string, unknown>;
    if (ownGeneration !== generation) return;
    const city = CityDefinitionSchema.parse(raw['city']);
    const scenario = ScenarioSchema.parse(raw['scenario']);
    const manifest = DemandManifestSchema.parse(raw['manifest']);
    const hashes = raw['hashes'] as { city: string; scenario: string; manifest: string };
    client = new SimulationClient('civitas-local');
    disposeSubscription = client.subscribe(observe);
    useCity.setState({
      model: presentationModel(city, manifest.agents, scenario.vehicleProfiles),
      horizon: scenario.horizonTicks,
    });
    await command({
      type: 'INIT',
      city,
      scenario,
      manifest,
      expectedHashes: hashes,
      compatibility: client.identity,
    });
  } catch (error) {
    if (ownGeneration === generation) useCity.setState({ busy: false, error: reason(error) });
  }
}
export function disposeApplication() {
  generation++;
  disposeSubscription?.();
  client?.dispose();
  client = null;
}
export function inspect(id: string) {
  return client?.request({ type: 'GET_DETAILS', entityId: id }).catch((error: unknown) => {
    useCity.setState({ error: reason(error) });
  });
}
export async function intervene(laneIds: string[], close: boolean) {
  if (!client) return;
  useCity.setState({ busy: true, error: '' });
  try {
    const details = await client.request({ type: 'GET_DETAILS', entityId: laneIds[0]! });
    if (details.type !== 'DETAILS') throw new Error('No topology observation available');
    const topology = details.facts.find((f) => f.startsWith('Topology version: '));
    if (!topology) throw new Error('Topology unavailable; intervention blocked');
    await client.request({
      type: 'SUBMIT',
      command: {
        commandId: `ui-${commandSerial++}`,
        intervention: {
          type: close ? 'CLOSE_LANES' : 'OPEN_LANES',
          laneIds,
          expectedTopologyVersion: Number(topology.slice(18)),
        },
      },
    });
  } catch (error) {
    useCity.setState({ error: reason(error) });
  } finally {
    useCity.setState({ busy: false });
  }
}
export async function exportRun(download = true) {
  await command({ type: 'PAUSE' });
  const result = await command({ type: 'EXPORT' });
  if (result?.type !== 'ARTIFACT') return null;
  lastArtifact = result.json;
  if (download) {
    const url = URL.createObjectURL(new Blob([result.json], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `civitas-tick-${useCity.getState().tick}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  useCity.setState({ notice: 'Verified run exported. Playback is paused.' });
  return result.json;
}
export async function importRun(file: File) {
  if (file.size > LIMITS.artifactBytes) {
    useCity.setState({ error: 'Import exceeds the 32 MiB limit.' });
    return;
  }
  if (!client) {
    useCity.setState({ error: 'Initialize a worker before importing.' });
    return;
  }
  const json = await file.text();
  const result = await command({ type: 'IMPORT', json, compatibility: client.identity });
  if (result?.type === 'RESTORED') {
    const artifact = JSON.parse(json) as EngineArtifact;
    lastArtifact = json;
    useCity.setState({
      model: presentationModel(
        CityDefinitionSchema.parse(artifact.city),
        artifact.manifest.agents,
        artifact.scenario.vehicleProfiles,
      ),
      horizon: artifact.scenario.horizonTicks,
      accepted: artifact.commands,
    });
  }
}
export async function replayRun() {
  const json = await exportRun(false);
  if (!json || !client) return;
  // IMPORT verifies by replaying S0 to the exported endpoint inside the worker.
  const result = await command({ type: 'IMPORT', json, compatibility: client.identity });
  if (result?.type === 'RESTORED') {
    const artifact = JSON.parse(json) as EngineArtifact;
    useCity.setState({
      accepted: artifact.commands,
      notice: `Replay from origin verified through tick ${result.snapshot.tick}. Restored paused.`,
    });
  }
}
export async function recoverRun() {
  if (client && lastArtifact) {
    useCity.setState({ busy: true });
    try {
      await client.recover(lastArtifact);
      useCity.setState({
        notice: 'Recovered the last explicit export. Later unsaved transitions are unavailable.',
      });
    } catch (error) {
      useCity.setState({ error: reason(error) });
    } finally {
      useCity.setState({ busy: false });
    }
  } else
    useCity.setState({ error: 'No exported recovery artifact. Restart creates a new experiment.' });
}
