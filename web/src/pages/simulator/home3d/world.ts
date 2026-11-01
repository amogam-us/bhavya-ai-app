import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Box2 } from './builder';
import { ChildFigure } from './child';
import { buildHouse, type House, type Sensor } from './house';
import {
  locate,
  pathBetween,
  SLOTS,
  spotOf,
  WORLD,
  type Place,
  type Point,
  type RoomSlot,
} from './plan';

export type Quality = 'high' | 'fast';

/** What the hub says about a room, shown in 3D. */
export interface RoomInfo {
  name: string;
  private: boolean;
  /** False when no hub zone uses this room's id; walking in then means "location unknown". */
  configured: boolean;
  /** null when the room has no smart light. */
  lightOn: boolean | null;
}

export interface ChildInfo {
  cameraOn: boolean;
  /** The glasses are looking (checking a step or looking for a routine). */
  looking: boolean;
  bubble: string | null;
}

export interface WorldEvents {
  /** The child walked into a room or out of the house. */
  onPlaceChange(place: Place): void;
  /** A lamp was clicked. */
  onLampClick(slot: RoomSlot): void;
}

const RADIUS = 0.22;
const WALK_SPEED = 2.3;
const RUN_SPEED = 3.8;
/** After the child moves, the hub's echo of an older room is ignored for this long. */
const SYNC_GRACE_MS = 1500;
const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, 1],
  KeyW: [0, 1],
  ArrowDown: [0, -1],
  KeyS: [0, -1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};

/** Keeps the AO pass from treating see-through overlays as solid objects. */
class OverlayAwareAOPass extends GTAOPass {
  override overrideVisibility(): void {
    super.overrideVisibility();
    this.scene.traverse((object) => {
      if (object.userData.noAO) object.visible = false;
    });
  }
}

/**
 * The 3D home: renders the house and the child, moves the child with the
 * keyboard or by clicking a room, and reports room changes. It holds no hub
 * state of its own; the page feeds it the hub's view with setRooms/setChild.
 */
export class HomeWorld {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly labels = new CSS2DRenderer();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
  private readonly controls: OrbitControls;
  private readonly sun = new THREE.DirectionalLight('#fff4e2', 2.4);
  private readonly house: House;
  private readonly child = new ChildFigure();
  private readonly environment: THREE.Texture;
  private composer: EffectComposer | null = null;
  private quality: Quality;

  private readonly keys = new Set<string>();
  private route: Point[] = [];
  private place: Place | null = 'outside';
  private lastMoveAt = -Infinity;
  private yaw = Math.PI;
  private desiredYaw = Math.PI;
  private follow = false;
  private rooms: Record<RoomSlot, RoomInfo> | null = null;
  private childInfo: ChildInfo = { cameraOn: false, looking: false, bubble: null };
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private pointerDown: [number, number] | null = null;
  private readonly resizeObserver: ResizeObserver;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly events: WorldEvents,
    quality: Quality,
  ) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor('#cfe3ea');
    container.appendChild(this.renderer.domElement);
    this.labels.domElement.className = 'sim3d-labels';
    container.appendChild(this.labels.domElement);

    // Soft, realistic ambient light from a studio environment, plus the sun.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.environment;
    this.scene.environmentIntensity = 0.55;
    this.scene.background = new THREE.Color('#cfe3ea');
    this.scene.fog = new THREE.Fog('#cfe3ea', 34, 70);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#b7c9b2', 0.55));
    this.sun.position.set(-7, 15, 9);
    this.sun.castShadow = true;
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = -13;
    shadowCamera.right = 13;
    shadowCamera.top = 13;
    shadowCamera.bottom = -13;
    shadowCamera.near = 1;
    shadowCamera.far = 45;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);

    this.house = buildHouse(this.scene);
    this.scene.add(this.child.group);
    this.placeChild(spotOf('outside'));

    this.camera.position.set(0.5, 15.5, 13.5);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0.8);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 32;
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = 1.3;

    this.applyQuality();
    this.listen();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // --------------------------------------------------------------- inputs from the page

  setRooms(rooms: Record<RoomSlot, RoomInfo>): void {
    this.rooms = rooms;
    for (const slot of SLOTS) {
      const info = rooms[slot];
      const visual = this.house.rooms[slot];
      const badge = !info.configured
        ? '<span class="is-unset">Not set up in the hub</span>'
        : info.private
          ? '<span class="is-private">🔒 Private · camera off</span>'
          : '<span>📷 Camera OK</span>';
      visual.labelEl.innerHTML = `<b></b>${badge}`;
      const name = visual.labelEl.querySelector('b');
      if (name) name.textContent = info.name;
      this.house.lamps[slot].on = info.lightOn === true;
    }
  }

  setChild(info: ChildInfo): void {
    if (info.looking && !this.childInfo.looking) this.child.flashView();
    this.childInfo = info;
    this.child.setBubble(info.bubble);
  }

  /**
   * Moves the child to where the hub says it is, unless the child is moving or
   * just moved here (then the hub's message is an echo of an older room).
   * `null` means the hub does not know where the child is.
   */
  syncPlace(target: RoomSlot | null): void {
    if (this.route.length > 0 || this.keys.size > 0) return;
    if (performance.now() - this.lastMoveAt < SYNC_GRACE_MS) return;
    const here = this.place;
    if (target === null) {
      const known = here && here !== 'outside' && this.rooms?.[here].configured;
      if (!known) return;
      this.teleport('outside');
      return;
    }
    if (here !== target) this.teleport(target);
  }

  /** Walks the child to a room (or outside) through the doors. */
  walkTo(place: Place): void {
    this.route = pathBetween(this.place ?? locate(...this.childPoint(), 0), place);
  }

  setFollow(follow: boolean): void {
    this.follow = follow;
  }

  setQuality(quality: Quality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.applyQuality();
    this.resize();
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    for (const undo of this.cleanup) undo();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.composer?.dispose();
    this.child.dispose();
    this.house.dispose();
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }

  // --------------------------------------------------------------- frame loop

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    const speed = this.move(dt);

    let diff = this.desiredYaw - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * Math.min(1, dt * 10);
    this.child.group.rotation.y = this.yaw;
    this.child.update(dt, t, speed, this.childInfo.cameraOn, this.childInfo.looking);

    for (const lamp of Object.values(this.house.lamps)) {
      lamp.level += ((lamp.on ? 1 : 0) - lamp.level) * Math.min(1, dt * 4);
      // Lights stay in the scene at zero intensity: adding or removing them recompiles shaders.
      lamp.light.intensity = lamp.level * 16;
      lamp.bulb.emissiveIntensity = lamp.level * 3;
      lamp.shade.emissiveIntensity = lamp.level * 0.55;
      lamp.glow.material.opacity = lamp.level * 0.7;
    }
    for (const slot of SLOTS) {
      const info = this.rooms?.[slot];
      const tint = this.house.rooms[slot].tint.material;
      const target = info?.private ? (this.place === slot ? 0.2 : 0.1) : 0;
      tint.opacity += (target - tint.opacity) * Math.min(1, dt * 4);
    }
    for (const sensor of this.house.sensors) {
      sensor.flash = Math.max(0, sensor.flash - dt * 1.1);
      sensor.led.emissiveIntensity = sensor.flash * 3;
    }

    if (this.follow) {
      const [x, z] = this.childPoint();
      const k = Math.min(1, dt * 3);
      const dx = (x - this.controls.target.x) * k;
      const dz = (z + 0.5 - this.controls.target.z) * k;
      this.controls.target.x += dx;
      this.controls.target.z += dz;
      this.camera.position.x += dx;
      this.camera.position.z += dz;
    }
    this.controls.update();

    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  /** Moves the child for one frame and returns its speed. */
  private move(dt: number): number {
    let dirX = 0;
    let dirZ = 0;
    let speed = 0;
    let collide = true;

    const input = this.keyInput();
    if (input) {
      this.route = [];
      // Up moves away from the camera, whichever way the view is turned.
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      dirX = forward.x * input.z - forward.z * input.x;
      dirZ = forward.z * input.z + forward.x * input.x;
      speed = input.run ? RUN_SPEED : WALK_SPEED;
    } else if (this.route.length > 0) {
      const [tx, tz] = this.route[0] as Point;
      const [x, z] = this.childPoint();
      const dist = Math.hypot(tx - x, tz - z);
      if (dist < 0.05) {
        this.route.shift();
        return this.route.length > 0 ? WALK_SPEED : 0;
      }
      dirX = (tx - x) / dist;
      dirZ = (tz - z) / dist;
      speed = Math.min(WALK_SPEED, dist / dt);
      // Routes go through doorways and are planned clear of furniture.
      collide = false;
    }
    if (speed === 0) return 0;

    const length = Math.hypot(dirX, dirZ) || 1;
    dirX /= length;
    dirZ /= length;
    this.desiredYaw = Math.atan2(dirX, dirZ);
    const step = speed * dt;
    const [x, z] = this.childPoint();
    let nx = THREE.MathUtils.clamp(x + dirX * step, WORLD.x1, WORLD.x2);
    let nz = THREE.MathUtils.clamp(z + dirZ * step, WORLD.z1, WORLD.z2);
    if (collide) {
      // Slide along walls: try each axis on its own.
      if (this.blocked(nx, z)) nx = x;
      if (this.blocked(nx, nz)) nz = z;
    }
    const moved = Math.hypot(nx - x, nz - z);
    this.placeChild([nx, nz]);
    if (moved > 0) this.lastMoveAt = performance.now();
    this.updatePlace();
    return moved / dt;
  }

  private keyInput(): { x: number; z: number; run: boolean } | null {
    let x = 0;
    let z = 0;
    for (const code of this.keys) {
      const dir = KEYS[code];
      if (dir) {
        x += dir[0];
        z += dir[1];
      }
    }
    if (x === 0 && z === 0) return null;
    return { x, z, run: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') };
  }

  private blocked(x: number, z: number): boolean {
    return this.house.colliders.some((box: Box2) => {
      const cx = THREE.MathUtils.clamp(x, box.x1, box.x2);
      const cz = THREE.MathUtils.clamp(z, box.z1, box.z2);
      return (x - cx) ** 2 + (z - cz) ** 2 < RADIUS * RADIUS;
    });
  }

  private updatePlace(): void {
    const [x, z] = this.childPoint();
    const found = locate(x, z);
    if (found === null || found === this.place) return;
    this.place = found;
    this.flashNearestSensor();
    this.events.onPlaceChange(found);
  }

  private teleport(place: Place): void {
    this.route = [];
    this.placeChild(spotOf(place));
    this.place = place;
    this.desiredYaw = this.yaw = place === 'outside' ? Math.PI : Math.PI / 6;
  }

  private placeChild([x, z]: Point): void {
    this.child.group.position.x = x;
    this.child.group.position.z = z;
  }

  private childPoint(): [number, number] {
    return [this.child.group.position.x, this.child.group.position.z];
  }

  private flashNearestSensor(): void {
    const [x, z] = this.childPoint();
    let best: Sensor | null = null;
    let bestDistance = 2.2;
    for (const sensor of this.house.sensors) {
      const distance = Math.hypot(sensor.position.x - x, sensor.position.z - z);
      if (distance < bestDistance) {
        best = sensor;
        bestDistance = distance;
      }
    }
    if (best) best.flash = 1;
  }

  // --------------------------------------------------------------- setup helpers

  private applyQuality(): void {
    const high = this.quality === 'high';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 1.75 : 1));
    this.sun.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.composer?.dispose();
    this.composer = null;
    if (high) {
      const composer = new EffectComposer(this.renderer);
      composer.addPass(new RenderPass(this.scene, this.camera));
      const ao = new OverlayAwareAOPass(this.scene, this.camera);
      ao.blendIntensity = 0.85;
      ao.updateGtaoMaterial({ radius: 0.35, distanceFallOff: 1, thickness: 1, scale: 1 });
      composer.addPass(ao);
      composer.addPass(new OutputPass());
      this.composer = composer;
    }
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.labels.setSize(width, height);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(width, height);
    this.camera.aspect = width / height;
    // Narrow views step back so the whole house still fits.
    this.camera.fov = width / height < 1.2 ? 46 : 36;
    this.camera.updateProjectionMatrix();
  }

  private listen(): void {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      if (!(event.code in KEYS) && !event.code.startsWith('Shift')) return;
      if (event.code.startsWith('Arrow')) event.preventDefault();
      this.keys.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);
    const onBlur = () => this.keys.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    const canvas = this.renderer.domElement;
    const onPointerDown = (event: PointerEvent) => {
      this.pointerDown = [event.clientX, event.clientY];
    };
    const onPointerUp = (event: PointerEvent) => {
      const start = this.pointerDown;
      this.pointerDown = null;
      if (!start || Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 5) return;
      this.click(event);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    this.cleanup.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
    });
  }

  private click(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.house.clickables, false)[0];
    if (!hit) return;
    const lamp = hit.object.userData.lamp as RoomSlot | undefined;
    if (lamp) {
      this.events.onLampClick(lamp);
      return;
    }
    const place = hit.object.userData.place as Place | undefined;
    if (place) this.walkTo(place);
  }
}

/** True when this browser can draw 3D. */
export function canRender3D(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
