import { addAfterEffect, addEffect, Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Component, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { ACESFilmicToneMapping, Color, Object3D, PerspectiveCamera, Vector3 } from 'three';
import type { InstancedMesh } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bounds, entityPosition, world } from './model';
import type { Model } from './model';
import { environment } from './dressing';
import type { Block } from './dressing';
import { cameraAction, mapFallback, presentation, selectEntity, useCity } from '../state/city';

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    mapFallback('The 3D renderer could not initialize. The same experiment is available in Map.');
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Blocks({
  items,
  onPick,
  flat = false,
}: {
  items: readonly Block[];
  onPick?: (id: string) => void;
  flat?: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new Object3D();
    items.forEach((b, i) => {
      object.position.set(b.x, b.y, -b.n);
      object.scale.set(b.w, b.h, b.d);
      object.rotation.y = b.rotation ?? 0;
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      mesh.setColorAt(i, new Color(b.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  const pick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const id = event.instanceId === undefined ? undefined : items[event.instanceId]?.id;
    if (id && event.delta < 4) onPick?.(id);
  };
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, items.length]}
      onClick={pick}
      castShadow={!flat}
      receiveShadow
    >
      <boxGeometry />
      <meshStandardMaterial roughness={0.91} metalness={0.02} />
    </instancedMesh>
  );
}

function Geometry({ model }: { model: Model }) {
  const debug = useCity((s) => s.debug);
  const quality = useCity((s) => s.quality);
  const selected = useCity((s) => s.selected);
  const scene = useMemo(() => {
    const streets: Block[] = [],
      pavement: Block[] = [],
      markings: Block[] = [],
      buildings: Block[] = [];
    for (const s of model.city.segments) {
      const b = bounds(s.footprint);
      streets.push({
        x: b.x,
        n: b.n,
        y: 0.06,
        w: b.width,
        d: b.depth,
        h: 0.12,
        color: '#373e3e',
        id: s.id,
      });
      pavement.push({
        x: b.x,
        n: b.n,
        y: -0.04,
        w: b.width + 7,
        d: b.depth + 7,
        h: 0.16,
        color: '#85877a',
      });
      const horizontal = b.width > b.depth;
      for (let offset = -72; offset <= 72; offset += 9)
        markings.push({
          x: b.x + (horizontal ? offset : 0),
          n: b.n + (horizontal ? 0 : offset),
          y: 0.14,
          w: horizontal ? 3.6 : 0.14,
          d: horizontal ? 0.14 : 3.6,
          h: 0.025,
          color: '#b7ad88',
        });
    }
    for (const node of model.city.nodes) {
      streets.push({
        x: node.position.eastM,
        n: node.position.northM,
        y: 0.07,
        w: 24,
        d: 24,
        h: 0.12,
        color: '#373e3e',
        id: node.id,
      });
      pavement.push({
        x: node.position.eastM,
        n: node.position.northM,
        y: -0.04,
        w: 29,
        d: 29,
        h: 0.16,
        color: '#85877a',
      });
    }
    for (const lane of model.lanes) {
      const p = lane.centerline.at(-1)!,
        first = lane.centerline[0]!;
      const horizontal = first.northM === p.northM;
      markings.push({
        x: p.eastM,
        n: p.northM,
        y: 0.16,
        w: horizontal ? 0.35 : lane.widthM - 0.3,
        d: horizontal ? lane.widthM - 0.3 : 0.35,
        h: 0.03,
        color: '#e1d9ba',
      });
      const dx = (p.eastM - first.eastM) / lane.lengthM,
        dn = (p.northM - first.northM) / lane.lengthM;
      markings.push({
        x: p.eastM + dn * 2.6,
        n: p.northM - dx * 2.6,
        y: 1.8,
        w: 0.16,
        d: 0.16,
        h: 3.6,
        color: '#454c46',
      });
    }
    for (const b of model.city.buildings) {
      const r = bounds(b.footprint),
        h = b.floors * b.floorHeightM;
      buildings.push({
        x: r.x,
        n: r.n,
        y: b.elevationM + h / 2,
        w: r.width,
        d: r.depth,
        h,
        color: b.districtId === 'D0' ? '#b4967e' : b.districtId === 'D1' ? '#c4bdab' : '#a6a99b',
        id: b.id,
      });
    }
    return { streets, pavement, markings, buildings, dressing: environment(model) };
  }, [model]);
  const selection = selected ? entityPosition(model, selected) : null;
  return (
    <>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[270, -0.18, -180]}>
        <planeGeometry args={[2200, 1800]} />
        <meshStandardMaterial color="#5b665d" roughness={1} />
      </mesh>
      <mesh receiveShadow position={[270, -3, -180]}>
        <boxGeometry args={[728, 5.5, 548]} />
        <meshStandardMaterial color="#72796a" roughness={1} />
      </mesh>
      {model.city.districts.map((district, i) => {
        const b = bounds(district.polygon);
        return (
          <mesh
            key={district.id}
            position={[b.x, -0.14, -b.n]}
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={(e) => {
              e.stopPropagation();
              if (e.delta < 4) selectEntity(district.id);
            }}
          >
            <planeGeometry args={[b.width, b.depth]} />
            <meshStandardMaterial
              color={['#737765', '#7b7d6f', '#6a7468'][i] ?? '#737765'}
              roughness={1}
            />
          </mesh>
        );
      })}
      <Blocks items={scene.pavement} flat />
      <Blocks items={scene.streets} onPick={selectEntity} flat />
      <Blocks items={scene.markings} flat />
      <Blocks items={scene.buildings} onPick={selectEntity} />
      {!debug && (
        <>
          <Blocks items={scene.dressing.context} />
          <Blocks items={scene.dressing.masses} />
          <Blocks items={scene.dressing.paving} flat />
          {quality === 'standard' && <Blocks items={scene.dressing.details} />}
          <Trees items={scene.dressing.trees} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[270, -0.3, 159]}>
            <planeGeometry args={[2200, 115]} />
            <meshStandardMaterial color="#566d6b" roughness={0.5} metalness={0.15} />
          </mesh>
          <mesh position={[270, -0.7, 100]}>
            <boxGeometry args={[2200, 1, 5]} />
            <meshStandardMaterial color="#a3a28b" roughness={0.95} />
          </mesh>
        </>
      )}
      {debug && <DebugPaths model={model} />}
      {selection && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[selection.eastM, 0.3, -selection.northM]}>
          <ringGeometry args={[10, 11.2, 48]} />
          <meshBasicMaterial color="#eed0a1" depthTest={false} transparent opacity={0.85} />
        </mesh>
      )}
    </>
  );
}
function Trees({ items }: { items: readonly Block[] }) {
  const ref = useRef<InstancedMesh>(null);
  useEffect(() => {
    const object = new Object3D(),
      mesh = ref.current;
    if (!mesh) return;
    items.forEach((b, i) => {
      object.position.set(b.x, b.y + 1, -b.n);
      object.scale.set(b.w / 2, b.h / 2, b.d / 2);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color="#647554" roughness={1} />
    </instancedMesh>
  );
}
function DebugPaths({ model }: { model: Model }) {
  const paths = useMemo(
    () =>
      [...model.lanes, ...model.movements].flatMap((edge) =>
        edge.centerline.slice(1).map((p, i) => {
          const a = edge.centerline[i]!;
          return {
            x: (a.eastM + p.eastM) / 2,
            n: (a.northM + p.northM) / 2,
            y: 0.25,
            w: 0.3,
            h: 0.04,
            d: Math.hypot(a.eastM - p.eastM, a.northM - p.northM),
            rotation: -Math.atan2(p.eastM - a.eastM, p.northM - a.northM),
            color: edge.id.startsWith('L:') ? '#8ce7d2' : '#eac68f',
          };
        }),
      ),
    [model],
  );
  return <Blocks items={paths} flat />;
}

function Traffic({ model }: { model: Model }) {
  const { gl } = useThree();
  const bodies = useRef<InstancedMesh>(null),
    cabins = useRef<InstancedMesh>(null),
    signals = useRef<InstancedMesh>(null),
    closures = useRef<InstancedMesh>(null);
  const slots = useRef<string[]>([]);
  const object = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const staticSymbols = useCity((s) => s.motion);
  const metrics = useCity((s) => s.metrics);
  const queueBlocks = useMemo(() => {
    return model.lanes.map((lane) => {
      const queue =
        metrics.find(
          (m) => m.metricId === 'lane_queue' && m.scope.kind === 'LANE' && m.scope.id === lane.id,
        )?.value ?? 0;
      const p = lane.centerline.at(-1)!,
        a = lane.centerline[0]!;
      const length = Math.min(lane.lengthM, queue * 6.5);
      const dx = (p.eastM - a.eastM) / lane.lengthM,
        dn = (p.northM - a.northM) / lane.lengthM;
      return {
        x: p.eastM - (dx * length) / 2,
        n: p.northM - (dn * length) / 2,
        y: 0.2,
        w: lane.widthM * 0.9,
        h: 0.04,
        d: length,
        rotation: -Math.atan2(dx, dn),
        color: '#ae7956',
      };
    });
    // Queue measurements refresh with observed ticks; no speed-derived queue guess.
  }, [model, metrics]);
  useFrame(() => {
    const sample = presentation.sample(model, performance.now(), staticSymbols);
    if (!sample || !bodies.current || !cabins.current || !signals.current || !closures.current)
      return;
    bodies.current.count = sample.vehicles.length;
    cabins.current.count = sample.vehicles.length;
    gl.domElement.setAttribute('data-visible-vehicles', String(sample.vehicles.length));
    gl.domElement.setAttribute('data-view-tick', String(sample.tick));
    slots.current = sample.vehicles.map((v) => v.id);
    const selected = useCity.getState().selected;
    sample.vehicles.forEach((v, i) => {
      // Snapshot positions are front bumpers. Center the actual 4.5 m body behind them.
      const length = (model.vehicleLengthsMm[v.slot] ?? 4500) / 1000;
      const x = v.eastM - (Math.sin(v.heading) * length) / 2;
      const z = -v.northM + (Math.cos(v.heading) * length) / 2;
      object.position.set(x, 0.78, z);
      object.rotation.set(0, -v.heading, 0);
      object.scale.set(1.8, 1.25, length);
      object.updateMatrix();
      bodies.current!.setMatrixAt(i, object.matrix);
      color.set(
        v.id === selected ? '#ffd68e' : ['#e5dfca', '#bfcabc', '#bca58a', '#738d8f'][v.slot % 4]!,
      );
      bodies.current!.setColorAt(i, color);
      object.position.y = 1.57;
      object.scale.set(1.53, 0.62, 2.25);
      object.updateMatrix();
      cabins.current!.setMatrixAt(i, object.matrix);
    });
    bodies.current.instanceMatrix.needsUpdate = true;
    cabins.current.instanceMatrix.needsUpdate = true;
    if (bodies.current.instanceColor) bodies.current.instanceColor.needsUpdate = true;
    let lights = 0;
    model.lanes.forEach((lane) => {
      const index = model.city.intersections.findIndex((j) => j.nodeId === lane.toNodeId),
        signal = sample.signals[index];
      const p = lane.centerline.at(-1)!,
        a = lane.centerline[0]!;
      const dx = (p.eastM - a.eastM) / lane.lengthM,
        dn = (p.northM - a.northM) / lane.lengthM;
      const approach = dn > 0 ? 2 : dx > 0 ? 3 : dn < 0 ? 0 : 1;
      const phase = signal?.[2] === approach ? signal?.[1] : 2;
      object.position.set(p.eastM + dn * 2.6, 3.8, -Number(p.northM) + dx * 2.6);
      object.rotation.set(0, 0, 0);
      object.scale.set(0.9, 1.1, 0.9);
      object.updateMatrix();
      signals.current!.setMatrixAt(lights, object.matrix);
      color.set(phase === 0 ? '#a5dbb6' : phase === 1 ? '#edc47d' : '#e08e75');
      signals.current!.setColorAt(lights++, color);
    });
    signals.current.count = lights;
    signals.current.instanceMatrix.needsUpdate = true;
    if (signals.current.instanceColor) signals.current.instanceColor.needsUpdate = true;
    let bars = 0;
    sample.laneClosed.forEach((closed, i) => {
      if (!closed) return;
      const lane = model.lanes[i]!,
        p = lane.centerline[0]!,
        last = lane.centerline.at(-1)!;
      object.position.set(p.eastM, 0.7, -Number(p.northM));
      object.rotation.set(0, -Math.atan2(last.eastM - p.eastM, last.northM - p.northM), 0);
      object.scale.set(lane.widthM, 0.45, 0.45);
      object.updateMatrix();
      closures.current!.setMatrixAt(bars++, object.matrix);
    });
    closures.current.count = bars;
    closures.current.instanceMatrix.needsUpdate = true;
  });
  const pick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta < 4 && e.instanceId !== undefined)
      selectEntity(slots.current[e.instanceId] ?? null);
  };
  return (
    <>
      <instancedMesh
        ref={bodies}
        args={[undefined, undefined, 300]}
        frustumCulled={false}
        onClick={pick}
      >
        <boxGeometry />
        <meshStandardMaterial roughness={0.55} />
      </instancedMesh>
      <instancedMesh
        ref={cabins}
        args={[undefined, undefined, 300]}
        frustumCulled={false}
        onClick={pick}
      >
        <boxGeometry />
        <meshStandardMaterial color="#34464a" roughness={0.38} />
      </instancedMesh>
      <instancedMesh
        ref={signals}
        args={[undefined, undefined, 34]}
        frustumCulled={false}
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta < 4 && e.instanceId !== undefined)
            selectEntity(model.lanes[e.instanceId]?.toNodeId ?? null);
        }}
      >
        <boxGeometry />
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh ref={closures} args={[undefined, undefined, 34]} frustumCulled={false}>
        <boxGeometry />
        <meshStandardMaterial color="#ef9e83" />
      </instancedMesh>
      <Blocks items={queueBlocks} flat />
    </>
  );
}

function CameraRig({ model }: { model: Model }) {
  const { camera, gl, size } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);
  const intent = useCity((s) => s.camera);
  const reducedMotion = useCity((s) => s.motion);
  const target = useRef<{ eye: Vector3; look: Vector3 } | null>(null);
  useEffect(() => {
    if (camera instanceof PerspectiveCamera) {
      const fov = size.width / size.height < 1.25 ? 55 : 35;
      camera.setFocalLength(camera.getFilmHeight() / (2 * Math.tan((fov * Math.PI) / 360)));
      camera.updateProjectionMatrix();
    }
  }, [camera, size.width, size.height]);
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controlsRef.current = controls;
    controls.target.set(270, 0, -180);
    controls.dampingFactor = 0.09;
    controls.minDistance = 35;
    controls.maxDistance = 1400;
    controls.minPolarAngle = Math.PI / 18;
    controls.maxPolarAngle = (Math.PI * 65) / 180;
    controls.screenSpacePanning = false;
    const cancel = () => {
      target.current = null;
    };
    controls.addEventListener('start', cancel);
    return () => {
      controls.removeEventListener('start', cancel);
      controls.dispose();
    };
  }, [camera, gl]);
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const p = intent.id
      ? (entityPosition(model, intent.id) ??
        presentation.sample(model, performance.now())?.vehicles.find((v) => v.id === intent.id))
      : null;
    if (intent.action === 'reset')
      target.current = { eye: new Vector3(805, 720, 665), look: new Vector3(270, 0, -180) };
    else if (intent.action === 'focus' && p) {
      const district = model.city.districts.some((d) => d.id === intent.id),
        distance = district ? 420 : 135;
      const look = new Vector3(...world(p));
      target.current = {
        look,
        eye: look.clone().add(new Vector3(distance * 0.65, distance, distance)),
      };
    } else {
      const offset = new Vector3();
      if (intent.action === 'left') offset.x = -25;
      if (intent.action === 'right') offset.x = 25;
      if (intent.action === 'up') offset.z = -25;
      if (intent.action === 'down') offset.z = 25;
      if (intent.action === 'in' || intent.action === 'out')
        camera.position
          .sub(controls.target)
          .multiplyScalar(intent.action === 'in' ? 0.8 : 1.25)
          .add(controls.target);
      else {
        camera.position.add(offset);
        controls.target.add(offset);
      }
      controls.update();
    }
    if (reducedMotion && target.current) {
      camera.position.copy(target.current.eye);
      controls.target.copy(target.current.look);
      target.current = null;
      controls.update();
    }
  }, [intent, model, camera, reducedMotion]);
  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.enableDamping = !reducedMotion;
    if (target.current) {
      const alpha = 1 - Math.exp(-Math.min(delta, 0.1) * 10);
      camera.position.lerp(target.current.eye, alpha);
      controls.target.lerp(target.current.look, alpha);
      if (camera.position.distanceTo(target.current.eye) < 0.2) target.current = null;
    }
    const before = controls.target.clone();
    controls.target.set(
      Math.max(-170, Math.min(710, controls.target.x)),
      0,
      Math.max(-530, Math.min(170, controls.target.z)),
    );
    camera.position.add(controls.target.clone().sub(before));
    camera.position.setY(Math.max(12, camera.position.y));
    controls.update();
  });
  return null;
}

function Diagnostics() {
  const { gl } = useThree();
  const frames = useRef<number[]>([]),
    last = useRef(0),
    slow = useRef(0);
  const work = useRef<number[]>([]);
  useEffect(() => {
    let started = 0;
    const before = addEffect(() => {
      started = performance.now();
    });
    const after = addAfterEffect(() => {
      if (!started) return;
      const ms = performance.now() - started;
      if (work.current.length < 20000) work.current.push(ms);
      if (gl.domElement.getAttribute('data-measure-frames') === 'true')
        gl.domElement.dispatchEvent(new CustomEvent('civitas:frame', { detail: ms }));
    });
    return () => {
      before();
      after();
    };
  }, [gl]);
  useFrame((_, delta) => {
    const now = performance.now();
    if (useCity.getState().mode === 'RUNNING' && delta > 0.08) slow.current++;
    else slow.current = Math.max(0, slow.current - 1);
    if (slow.current > 180)
      mapFallback(
        'Sustained slow rendering detected. Map preserves this experiment; you can retry Reduced City.',
      );
    if (frames.current.length < 20000) frames.current.push(delta * 1000);
    if (now - last.current < 1000) return;
    last.current = now;
    const element = gl.domElement;
    element.setAttribute('data-render-calls', String(gl.info.render.calls));
    element.setAttribute('data-triangles', String(gl.info.render.triangles));
    element.setAttribute('data-geometries', String(gl.info.memory.geometries));
    element.setAttribute('data-textures', String(gl.info.memory.textures));
    element.setAttribute('data-frame-samples', JSON.stringify(frames.current.slice(-240)));
    element.setAttribute('data-work-samples', JSON.stringify(work.current.slice(-240)));
  });
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      mapFallback(
        'WebGL context lost. Simulation and selection are preserved in Map. Retry City to create a fresh context.',
      );
    };
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [gl]);
  return null;
}

export default function CityScene({ model }: { model: Model }) {
  const quality = useCity((s) => s.quality);
  return (
    <SceneBoundary>
      <Canvas
        shadows={quality === 'standard'}
        dpr={[1, quality === 'standard' ? 1.5 : 1]}
        camera={{ position: [805, 720, 665], fov: 35, near: 0.5, far: 3000 }}
        gl={{
          antialias: quality === 'standard',
          alpha: false,
          powerPreference: 'high-performance',
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
        }}
        onPointerMissed={(e) => {
          if (e.type === 'click') selectEntity(null);
        }}
        fallback={<p>WebGL2 is unavailable. Choose Map to continue.</p>}
      >
        <color attach="background" args={['#7e8b87']} />
        <fog attach="fog" args={['#7e8b87', 1000, 2350]} />
        <hemisphereLight args={['#e7e9e3', '#59635e', 1.8]} />
        <directionalLight
          position={[-160, 520, 220]}
          intensity={2.4}
          color="#fff1de"
          castShadow={quality === 'standard'}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-500}
          shadow-camera-right={650}
          shadow-camera-top={600}
          shadow-camera-bottom={-500}
          shadow-camera-far={1300}
          shadow-bias={-0.0004}
        >
          <object3D attach="target" position={[270, 0, -180]} />
        </directionalLight>
        <Geometry model={model} />
        <Traffic model={model} />
        <CameraRig model={model} />
        <Diagnostics />
      </Canvas>
    </SceneBoundary>
  );
}

export function CameraTools() {
  return (
    <div className="camera-tools" aria-label="Camera controls">
      <button onClick={() => cameraAction('in')} aria-label="Zoom in">
        +
      </button>
      <button onClick={() => cameraAction('out')} aria-label="Zoom out">
        −
      </button>
      <button onClick={() => cameraAction('up')} aria-label="Pan north">
        ↑
      </button>
      <button onClick={() => cameraAction('down')} aria-label="Pan south">
        ↓
      </button>
      <button onClick={() => cameraAction('left')} aria-label="Pan west">
        ←
      </button>
      <button onClick={() => cameraAction('right')} aria-label="Pan east">
        →
      </button>
      <button onClick={() => cameraAction('reset')} aria-label="Reset camera">
        ⌂
      </button>
    </div>
  );
}
