import { create } from 'zustand';
import type {
  AcceptedCommandInput,
  DeepReadonly,
  EngineEvent,
  EngineObservation,
} from '@civitas/contracts';
import type { Model } from '../scene/model';
import { PresentationBuffer } from '../scene/presentation';

export const presentation = new PresentationBuffer();
export type CameraIntent = {
  serial: number;
  action: 'reset' | 'focus' | 'left' | 'right' | 'up' | 'down' | 'in' | 'out';
  id: string | null;
};
interface CityView {
  model: Model | null;
  ready: boolean;
  failed: boolean;
  mode: 'PAUSED' | 'RUNNING';
  speed: 0.25 | 1 | 2 | 4;
  tick: number;
  horizon: number;
  metrics: readonly DeepReadonly<
    Extract<EngineObservation, { type: 'METRICS' }>['samples'][number]
  >[];
  events: readonly DeepReadonly<EngineEvent>[];
  accepted: readonly DeepReadonly<AcceptedCommandInput>[];
  selected: string | null;
  view: 'city' | 'map';
  quality: 'standard' | 'reduced';
  debug: boolean;
  motion: boolean;
  shortcuts: boolean;
  busy: boolean;
  notice: string;
  error: string;
  graphics: string;
  achieved: number | null;
  lag: number;
  completed: number;
  details: { id: string; tick: number; facts: readonly string[] } | null;
  camera: CameraIntent;
}
export const useCity = create<CityView>(() => ({
  model: null,
  ready: false,
  failed: false,
  mode: 'PAUSED',
  speed: 1,
  tick: 0,
  horizon: 9000,
  metrics: [],
  events: [],
  accepted: [],
  selected: null,
  view:
    typeof matchMedia !== 'undefined' && matchMedia('(max-width: 600px)').matches ? 'map' : 'city',
  quality: 'standard',
  debug: false,
  motion:
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  shortcuts: true,
  busy: false,
  notice: 'Preparing the local experiment…',
  error: '',
  graphics: '',
  achieved: null,
  lag: 0,
  details: null,
  completed: 0,
  camera: { serial: 0, action: 'reset', id: null },
}));
export function selectEntity(id: string | null) {
  useCity.setState({ selected: id, details: null });
}
export function cameraAction(action: CameraIntent['action'], id = useCity.getState().selected) {
  useCity.setState((s) => ({ camera: { action, id, serial: s.camera.serial + 1 } }));
}
export function mapFallback(reason: string) {
  useCity.setState({ view: 'map', graphics: reason });
}
