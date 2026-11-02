import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Builder, repeated, type Box2 } from './builder';
import { FRONT_DOOR, ROOM_PLANS, SLOTS, type Place, type RoomSlot } from './plan';
import * as tex from './textures';

const WALL_H = 1.25;
/** The wall between the back rooms and the front rooms is lower, to see into the back. */
const MID_H = 0.9;
/** The front wall is cut away, like a doll's house. */
const LOW_H = 0.32;
const T = 0.14;

export interface Lamp {
  slot: RoomSlot;
  bulb: THREE.MeshStandardMaterial;
  /** The lampshade glows a little when the light is on. */
  shade: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** 0 = off, 1 = on; eased towards `on` every frame. */
  level: number;
  on: boolean;
}

export interface RoomVisual {
  tint: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  labelEl: HTMLDivElement;
}

export interface Sensor {
  led: THREE.MeshStandardMaterial;
  position: THREE.Vector3;
  flash: number;
}

export interface House {
  colliders: Box2[];
  rooms: Record<RoomSlot, RoomVisual>;
  lamps: Record<RoomSlot, Lamp>;
  sensors: Sensor[];
  /** Meshes that can be clicked: floors (userData.place) and lamps (userData.lamp). */
  clickables: THREE.Object3D[];
  dispose(): void;
}

/** Builds the furnished home into `root`. */
export function buildHouse(root: THREE.Object3D): House {
  const b = new Builder(root);
  const clickables: THREE.Object3D[] = [];

  // ------------------------------------------------------------- materials
  const own = <T extends THREE.Texture>(t: T) => b.own(t);
  const woodTex = own(tex.woodFloor());
  const bathTiles = own(tex.tiles('#e6eef2', '#c9d3d8', 8, 3));
  const kitchenTiles = own(tex.tiles('#ede8df', '#cfc7b8', 5, 7));
  const wallPaint = own(tex.paint('#f7f4ee'));
  const grassTex = own(tex.grass());
  const skyTex = own(tex.sky());
  const glowTex = own(tex.glow());

  const mats = {
    wall: b.mat('#ffffff', { map: wallPaint, roughness: 0.95 }),
    wallCap: b.mat('#d6dcda', { roughness: 0.9 }),
    skirting: b.mat('#eae5dc', { roughness: 0.7 }),
    trim: b.mat('#fbfaf7', { roughness: 0.6 }),
    oak: b.mat('#ffffff', { map: own(repeated(woodTex, 0.6, 0.6)), roughness: 0.6 }),
    walnut: b.mat('#7a5638', { roughness: 0.55 }),
    lightWood: b.mat('#d8bf9c', { roughness: 0.65 }),
    porcelain: b.mat('#fbfbfb', { roughness: 0.18, metalness: 0.05 }),
    chrome: b.mat('#d7dde2', { roughness: 0.15, metalness: 0.9 }),
    steel: b.mat('#c9cfd4', { roughness: 0.3, metalness: 0.7 }),
    stone: b.mat('#e9e6e1', { roughness: 0.35 }),
    darkStone: b.mat('#3f454c', { roughness: 0.35 }),
    black: b.mat('#1d2126', { roughness: 0.4 }),
    glass: b.own(
      new THREE.MeshPhysicalMaterial({
        color: '#dff2fa',
        roughness: 0.05,
        transmission: 0,
        transparent: true,
        opacity: 0.25,
      }),
    ),
    mirror: b.mat('#cfe3ec', { roughness: 0.05, metalness: 0.85 }),
    window: b.own(
      new THREE.MeshStandardMaterial({
        map: skyTex,
        emissive: '#ffffff',
        emissiveMap: skyTex,
        emissiveIntensity: 0.6,
        roughness: 0.1,
      }),
    ),
    sofa: b.mat('#ffffff', { map: own(tex.fabric('#5c8f93')), roughness: 0.95 }),
    sofaDark: b.mat('#ffffff', { map: own(tex.fabric('#527f83', 4)), roughness: 0.95 }),
    cushion: b.mat('#ffffff', { map: own(tex.fabric('#6fa2a5', 6)), roughness: 0.95 }),
    armchair: b.mat('#ffffff', { map: own(tex.fabric('#c98f5b', 8)), roughness: 0.95 }),
    duvet: b.mat('#ffffff', { map: own(tex.fabric('#8fb0e3', 10)), roughness: 0.95 }),
    sheet: b.mat('#f6f7fb', { roughness: 0.9 }),
    headboard: b.mat('#ffffff', { map: own(tex.fabric('#b8a690', 12)), roughness: 0.95 }),
    curtain: b.mat('#ffffff', { map: own(tex.fabric('#e9dcc6', 14)), roughness: 0.95 }),
    towel: b.mat('#ffffff', { map: own(tex.fabric('#8fc1d6', 16)), roughness: 0.95 }),
    cabinet: b.mat('#eef0ec', { roughness: 0.45 }),
    fridge: b.mat('#e3e8eb', { roughness: 0.3, metalness: 0.35 }),
    terracotta: b.mat('#c2734d', { roughness: 0.8 }),
    leaf: b.mat('#4e8f55', { roughness: 0.7 }),
    leafLight: b.mat('#62a565', { roughness: 0.7 }),
    bark: b.mat('#6b4a32', { roughness: 0.9 }),
  };

  // ------------------------------------------------------------- ground
  {
    const lawn = b.flat(
      44,
      40,
      b.mat('#ffffff', { map: own(repeated(grassTex, 14, 13)), roughness: 1 }),
      0,
      -0.02,
      1,
    );
    lawn.userData.place = 'outside' satisfies Place;
    clickables.push(lawn);
    b.box(16.5, 0.14, 12.5, b.mat('#e7e2d8', { roughness: 0.9 }), 0, -0.14, 0);
    b.flat(
      1.4,
      3.6,
      b.mat('#ffffff', { map: own(repeated(own(tex.paving()), 1, 2.5)), roughness: 0.9 }),
      -0.9,
      0.004,
      8.0,
    );
    b.flat(
      1.0,
      0.6,
      b.mat('#ffffff', { map: own(tex.carpet('#8a6f4e', 17)), roughness: 1 }),
      -0.9,
      0.012,
      6.55,
    );
  }

  // ------------------------------------------------------------- floors and rooms
  const floorLooks: Record<RoomSlot, THREE.Material> = {
    restroom: b.mat('#ffffff', { map: own(repeated(bathTiles, 3, 2.5)), roughness: 0.25 }),
    bedroom: b.mat('#ffffff', { map: own(repeated(woodTex, 5, 2.5)), roughness: 0.55 }),
    living_room: b.mat('#ffffff', { map: own(repeated(woodTex, 5, 3.5)), roughness: 0.55 }),
    kitchen: b.mat('#ffffff', { map: own(repeated(kitchenTiles, 3, 3.5)), roughness: 0.3 }),
  };
  const rooms = {} as Record<RoomSlot, RoomVisual>;
  for (const slot of SLOTS) {
    const plan = ROOM_PLANS[slot];
    const w = plan.x2 - plan.x1;
    const d = plan.z2 - plan.z1;
    const cx = (plan.x1 + plan.x2) / 2;
    const cz = (plan.z1 + plan.z2) / 2;
    const floor = b.flat(w, d, floorLooks[slot], cx, 0.002, cz);
    floor.userData.place = slot satisfies Place;
    clickables.push(floor);

    const tint = b.flat(
      w,
      d,
      b.own(
        new THREE.MeshBasicMaterial({
          color: '#7c6cf0',
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      ),
      cx,
      0.02,
      cz,
    ) as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    tint.userData.noAO = true;

    const labelEl = document.createElement('div');
    labelEl.className = 'sim3d-room-label';
    const label = new CSS2DObject(labelEl);
    const back = plan.z1 < -1;
    // Back rooms: on top of the back wall, clear of the child's speech bubble.
    label.position.set(cx, back ? WALL_H + 0.12 : 0.55, back ? plan.z1 + 0.1 : plan.z2 - 0.45);
    root.add(label);
    rooms[slot] = { tint, labelEl };
  }

  // ------------------------------------------------------------- walls, doors and windows
  function wall(x1: number, z1: number, x2: number, z2: number, h = WALL_H) {
    const along = z1 === z2;
    const length = along ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
    const w = along ? length + T : T;
    const d = along ? T : length + T;
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    b.box(w, h, d, mats.wall, cx, 0, cz, { solid: true });
    b.box(w + 0.004, 0.025, d + 0.004, mats.wallCap, cx, h, cz, { shadow: false });
    b.box(along ? w : T + 0.03, 0.08, along ? T + 0.03 : d, mats.skirting, cx, 0, cz, {
      shadow: false,
    });
  }
  wall(-8, -6, 8, -6);
  wall(-8, -6, -8, 6);
  wall(8, -6, 8, 6);
  wall(-8, 6, FRONT_DOOR.x1, 6, LOW_H);
  wall(FRONT_DOOR.x2, 6, 8, 6, LOW_H);
  wall(-2, -6, -2, -1);
  wall(-8, -1, -5.6, -1, MID_H);
  wall(-4.4, -1, -0.6, -1, MID_H);
  wall(0.6, -1, 8, -1, MID_H);
  wall(2, -1, 2, 1.6);
  wall(2, 3.4, 2, 6);

  // Door frames.
  for (const x of [-5.6, -4.4, -0.6, 0.6]) b.box(0.08, MID_H + 0.04, T + 0.06, mats.trim, x, 0, -1);
  for (const z of [1.6, 3.4]) b.box(T + 0.06, WALL_H + 0.03, 0.08, mats.trim, 2, 0, z);
  for (const x of [FRONT_DOOR.x1, FRONT_DOOR.x2]) b.box(0.09, 1.3, T + 0.08, mats.trim, x, 0, 6);
  b.box(
    FRONT_DOOR.x2 - FRONT_DOOR.x1 + 0.18,
    0.09,
    T + 0.08,
    mats.trim,
    (FRONT_DOOR.x1 + FRONT_DOOR.x2) / 2,
    1.3,
    6,
  );

  // Open doors, hinged at the frame.
  function door(
    x: number,
    z: number,
    length: number,
    h: number,
    alongZ: boolean,
    look: THREE.Material,
  ) {
    if (alongZ) b.box(0.045, h, length, look, x, 0, z, { r: 0.01, solid: true });
    else b.box(length, h, 0.045, look, x, 0, z, { r: 0.01, solid: true });
    const knob = alongZ ? [x + 0.04, z + length / 2 - 0.1] : [x + length / 2 - 0.1, z + 0.04];
    b.ball(0.025, mats.chrome, knob[0] ?? x, h * 0.48, knob[1] ?? z);
  }
  door(-5.53, -1.6, 1.08, MID_H - 0.04, true, mats.lightWood);
  door(-0.53, -1.6, 1.08, MID_H - 0.04, true, mats.lightWood);
  door(-0.36, 5.42, 1.08, 1.2, true, mats.walnut);

  /** A window on the inside face of an outer wall. */
  function windowOn(axis: 'back' | 'left', at: number, width: number, sill = 0.42, height = 0.62) {
    const frame = 0.05;
    if (axis === 'back') {
      const z = -6 + T / 2;
      b.box(width, height, 0.01, mats.window, at, sill, z + 0.006, { shadow: false });
      b.box(width + frame * 2, frame, 0.06, mats.trim, at, sill - frame, z + 0.02);
      b.box(width + frame * 2, frame, 0.05, mats.trim, at, sill + height, z + 0.02);
      for (const dx of [-width / 2 - frame / 2, width / 2 + frame / 2, 0]) {
        b.box(dx === 0 ? 0.03 : frame, height, 0.05, mats.trim, at + dx, sill, z + 0.02);
      }
      b.box(width + 0.2, 0.03, 0.12, mats.trim, at, sill - frame - 0.03, z + 0.06);
    } else {
      const x = -8 + T / 2;
      b.box(0.01, height, width, mats.window, x + 0.006, sill, at, { shadow: false });
      b.box(0.06, frame, width + frame * 2, mats.trim, x + 0.02, sill - frame, at);
      b.box(0.05, frame, width + frame * 2, mats.trim, x + 0.02, sill + height, at);
      for (const dz of [-width / 2 - frame / 2, width / 2 + frame / 2, 0]) {
        b.box(0.05, height, dz === 0 ? 0.03 : frame, mats.trim, x + 0.02, sill, at + dz);
      }
      b.box(0.12, 0.03, width + 0.2, mats.trim, x + 0.06, sill - frame - 0.03, at);
    }
  }
  windowOn('back', -6.3, 0.75, 0.6, 0.45);
  windowOn('back', 2.5, 1.5);
  windowOn('left', 4.4, 1.3);

  // ------------------------------------------------------------- restroom
  b.box(0.42, 0.38, 0.38, mats.porcelain, -7.5, 0, -4.4, { r: 0.1 });
  b.box(0.5, 0.05, 0.42, mats.porcelain, -7.42, 0.38, -4.4, { r: 0.025 });
  b.box(0.17, 0.48, 0.46, mats.porcelain, -7.84, 0.3, -4.4, { r: 0.04 });
  b.box(0.05, 0.02, 0.1, mats.chrome, -7.84, 0.78, -4.4);
  b.solid(-8, -4.65, -7.15, -4.15);
  b.box(1.3, 0.76, 0.5, mats.lightWood, -3.7, 0, -5.68, { r: 0.03, solid: true });
  b.box(1.36, 0.05, 0.56, mats.stone, -3.7, 0.76, -5.66, { r: 0.02 });
  b.cyl(0.22, 0.17, 0.08, mats.porcelain, -3.7, 0.79, -5.62);
  b.cyl(0.018, 0.018, 0.16, mats.chrome, -3.7, 0.81, -5.86);
  b.box(0.03, 0.03, 0.12, mats.chrome, -3.7, 0.95, -5.8);
  b.box(0.92, 0.3, 0.025, mats.mirror, -3.7, 0.88, -5.915, { shadow: false });
  b.box(1.3, 0.05, 1.3, mats.porcelain, -7.25, 0, -1.8, { solid: true });
  b.box(0.025, 1.0, 1.3, mats.glass, -6.6, 0.05, -1.8, { shadow: false }).userData.noAO = true;
  b.cyl(0.014, 0.014, 0.95, mats.chrome, -7.9, 0.05, -1.8);
  b.cyl(0.08, 0.06, 0.03, mats.chrome, -7.82, 0.98, -1.8);
  b.box(0.05, 0.42, 0.5, mats.towel, -2.1, 0.45, -3.4, { r: 0.02 });
  b.box(0.03, 0.03, 0.6, mats.chrome, -2.1, 0.86, -3.4);
  b.flat(
    0.85,
    0.55,
    b.mat('#ffffff', { map: own(tex.carpet('#7eb3d0', 19)), roughness: 1 }),
    -5,
    0.008,
    -3.7,
  );
  b.cyl(0.19, 0.16, 0.42, b.mat('#c9a979', { roughness: 0.9 }), -2.55, 0, -5.5, { solid: true });

  // ------------------------------------------------------------- bedroom
  b.box(2.3, 0.3, 3.3, mats.walnut, 5.6, 0, -4.3, { r: 0.05, solid: true });
  b.box(2.12, 0.22, 3.08, mats.sheet, 5.6, 0.3, -4.28, { r: 0.08 });
  b.box(2.18, 0.12, 2.1, mats.duvet, 5.6, 0.47, -3.78, { r: 0.06 });
  b.box(0.85, 0.16, 0.42, mats.sheet, 5.13, 0.5, -5.45, { r: 0.08 });
  b.box(0.85, 0.16, 0.42, mats.sheet, 6.07, 0.5, -5.45, { r: 0.08 });
  b.box(2.4, 0.95, 0.1, mats.headboard, 5.6, 0, -5.9, { r: 0.04 });
  for (const x of [3.95, 7.25]) {
    b.box(0.5, 0.48, 0.45, mats.lightWood, x, 0, -5.68, { r: 0.03, solid: true });
    b.box(0.42, 0.015, 0.01, mats.walnut, x, 0.3, -5.45);
  }
  b.box(1.8, 1.2, 0.6, mats.lightWood, 0.4, 0, -5.65, { r: 0.03, solid: true });
  b.box(0.012, 1.1, 0.01, mats.walnut, 0.4, 0.05, -5.345);
  for (const x of [0.32, 0.48]) b.box(0.02, 0.18, 0.02, mats.chrome, x, 0.55, -5.33);
  b.box(0.55, 0.04, 1.1, mats.lightWood, -1.65, 0.7, -3.4, { solid: true });
  for (const [dx, dz] of [
    [-0.24, -0.5],
    [0.24, -0.5],
    [-0.24, 0.5],
    [0.24, 0.5],
  ] as const) {
    b.box(0.04, 0.7, 0.04, mats.walnut, -1.65 + dx, 0, -3.4 + dz);
  }
  b.box(0.36, 0.02, 0.26, b.mat('#2a2f36', { roughness: 0.3, metalness: 0.4 }), -1.62, 0.74, -3.5);
  chair(-1.05, -3.4, -Math.PI / 2, b.mat('#7aa6c2', { roughness: 0.6 }));
  b.flat(
    2.6,
    1.8,
    b.mat('#ffffff', { map: own(tex.carpet('#c9b8e8', 23)), roughness: 1 }),
    2.6,
    0.008,
    -3.4,
  );
  for (const [x, y, z, color] of [
    [2.3, 0.008, -3.6, '#ef6f6c'],
    [2.55, 0.008, -3.3, '#f4c542'],
    [2.42, 0.188, -3.47, '#5fb4a2'],
  ] as const) {
    b.box(0.18, 0.18, 0.18, b.mat(color, { roughness: 0.5 }), x, y, z, { r: 0.025 });
  }
  for (const x of [1.5, 3.5]) b.box(0.32, 1.08, 0.06, mats.curtain, x, 0.08, -5.86, { r: 0.02 });
  b.box(2.4, 0.02, 0.03, mats.walnut, 2.5, 1.17, -5.86);

  // ------------------------------------------------------------- living room
  b.box(3.4, 0.38, 1.0, mats.sofa, -4, 0, 5.18, { r: 0.08, solid: true });
  b.box(3.4, 0.6, 0.26, mats.sofa, -4, 0.3, 5.6, { r: 0.1 });
  b.box(0.26, 0.56, 1.0, mats.sofaDark, -5.65, 0, 5.18, { r: 0.1 });
  b.box(0.26, 0.56, 1.0, mats.sofaDark, -2.35, 0, 5.18, { r: 0.1 });
  b.box(1.48, 0.14, 0.8, mats.cushion, -4.78, 0.38, 5.08, { r: 0.07 });
  b.box(1.48, 0.14, 0.8, mats.cushion, -3.22, 0.38, 5.08, { r: 0.07 });
  b.box(0.4, 0.32, 0.12, b.mat('#e8b04b', { roughness: 0.9 }), -5.15, 0.48, 5.38, {
    r: 0.06,
    rotY: 0.25,
  });
  b.box(0.4, 0.32, 0.12, b.mat('#d77a61', { roughness: 0.9 }), -2.85, 0.48, 5.38, {
    r: 0.06,
    rotY: -0.2,
  });
  schoolBag(-3.0, 0.52, 5.02);
  b.flat(
    3.8,
    2.6,
    b.mat('#ffffff', { map: own(tex.carpet('#d9c3a0', 27)), roughness: 1 }),
    -4,
    0.008,
    3.75,
  );
  b.box(1.9, 0.05, 0.85, mats.walnut, -4, 0.36, 3.7, { r: 0.02, solid: true });
  for (const [dx, dz] of [
    [-0.88, -0.36],
    [0.88, -0.36],
    [-0.88, 0.36],
    [0.88, 0.36],
  ] as const) {
    b.box(0.05, 0.36, 0.05, mats.walnut, -4 + dx, 0, 3.7 + dz);
  }
  b.box(0.34, 0.06, 0.24, b.mat('#3d6fd8'), -4.55, 0.41, 3.62, { r: 0.02 });
  b.box(0.3, 0.05, 0.22, b.mat('#e05a4f'), -4.55, 0.47, 3.62, { r: 0.02 });
  b.cyl(0.045, 0.04, 0.1, b.mat('#f2efe9', { roughness: 0.3 }), -3.6, 0.41, 3.82);
  b.cyl(0.06, 0.06, 0.26, b.mat('#7cc7e8', { roughness: 0.3 }), -3.3, 0.41, 3.55);
  b.box(0.45, 0.45, 2.0, mats.walnut, -7.68, 0, 2.3, { r: 0.03, solid: true });
  b.box(0.18, 0.06, 0.4, mats.black, -7.7, 0.45, 2.3);
  b.box(0.05, 0.6, 1.1, mats.black, -7.72, 0.52, 2.3, { r: 0.015 });
  b.box(
    0.006,
    0.54,
    1.03,
    b.mat('#1e3a5a', { emissive: '#3b78b0', emissiveIntensity: 0.35, roughness: 0.2 }),
    -7.692,
    0.55,
    2.3,
    { shadow: false },
  );
  {
    const x = -6.75;
    const z = 4.05;
    b.box(0.85, 0.36, 0.85, mats.armchair, x, 0, z, { r: 0.08, solid: true });
    b.box(0.2, 0.55, 0.85, mats.armchair, x - 0.33, 0.28, z, { r: 0.08 });
    for (const dz of [-0.36, 0.36])
      b.box(0.85, 0.24, 0.14, mats.armchair, x, 0.3, z + dz, { r: 0.06 });
  }
  b.cyl(0.22, 0.17, 0.42, mats.terracotta, 1.35, 0, 5.35, { solid: true });
  for (const [dx, y, dz, r, look] of [
    [0, 0.72, 0, 0.32, mats.leaf],
    [-0.15, 0.95, 0.1, 0.24, mats.leafLight],
    [0.14, 1.02, -0.08, 0.22, mats.leaf],
    [0.02, 1.2, 0.04, 0.17, mats.leafLight],
  ] as const) {
    b.ball(r, look, 1.35 + dx, y, 5.35 + dz).scale.set(1, 1.25, 1);
  }
  b.box(0.35, 1.15, 1.6, mats.lightWood, 1.75, 0, 0.3, { r: 0.02, solid: true });
  {
    const colors = ['#c0504d', '#4f81bd', '#9bbb59', '#f2c14e', '#8064a2', '#4bacc6', '#e2725b'];
    let i = 0;
    for (const y of [0.05, 0.42, 0.79]) {
      b.box(0.33, 0.025, 1.52, mats.walnut, 1.74, y, 0.3);
      let z = -0.42;
      while (z < 0.98) {
        const width = 0.05 + ((i * 37) % 5) * 0.012;
        const height = 0.22 + ((i * 53) % 4) * 0.025;
        b.box(
          0.22,
          height,
          width,
          b.mat(colors[i % colors.length] ?? '#999', { roughness: 0.7 }),
          1.73,
          y + 0.025,
          z + width / 2,
        );
        z += width + 0.012;
        i += 1;
      }
    }
  }

  // ------------------------------------------------------------- kitchen
  b.box(0.62, 0.86, 4.2, mats.cabinet, 7.62, 0, 1.5, { r: 0.02, solid: true });
  b.box(0.68, 0.05, 4.24, mats.darkStone, 7.6, 0.86, 1.5);
  for (let z = -0.6 + 0.6; z < 3.6; z += 0.6)
    b.box(0.01, 0.78, 0.008, b.mat('#cfd3cf'), 7.305, 0.04, z);
  for (let z = -0.3; z < 3.6; z += 0.6) b.box(0.02, 0.02, 0.16, mats.steel, 7.29, 0.7, z);
  b.box(0.44, 0.012, 0.56, mats.steel, 7.6, 0.905, 0.45);
  b.cyl(0.018, 0.018, 0.22, mats.chrome, 7.84, 0.91, 0.45);
  b.box(0.16, 0.025, 0.025, mats.chrome, 7.77, 1.12, 0.45);
  b.box(0.52, 0.012, 0.6, mats.black, 7.6, 0.91, 2.3);
  for (const [dx, dz] of [
    [-0.12, -0.14],
    [0.12, -0.14],
    [-0.12, 0.14],
    [0.12, 0.14],
  ] as const) {
    b.cyl(0.08, 0.08, 0.006, b.mat('#555b62', { roughness: 0.5 }), 7.6 + dx, 0.922, 2.3 + dz);
  }
  b.box(
    0.02,
    0.32,
    4.2,
    b.mat('#ffffff', { map: own(repeated(kitchenTiles, 8, 0.6)), roughness: 0.25 }),
    7.92,
    0.91,
    1.5,
    { shadow: false },
  );
  b.box(0.75, 1.5, 0.75, mats.fridge, 7.52, 0, 4.85, { r: 0.05, solid: true });
  b.box(0.02, 0.5, 0.03, mats.steel, 7.13, 0.85, 4.6);
  b.box(0.02, 0.3, 0.03, mats.steel, 7.13, 0.35, 4.6);
  b.cyl(0.72, 0.72, 0.05, mats.oak, 4.6, 0.7, 4.3, { segments: 48 });
  b.cyl(0.07, 0.07, 0.7, mats.walnut, 4.6, 0, 4.3);
  b.cyl(0.3, 0.32, 0.03, mats.walnut, 4.6, 0, 4.3);
  b.solid(3.88, 3.58, 5.32, 5.02);
  const kitchenChair = b.mat('#7aa6c2', { roughness: 0.6 });
  chair(3.62, 4.3, Math.PI / 2, kitchenChair);
  chair(5.58, 4.3, -Math.PI / 2, kitchenChair);
  chair(4.6, 5.28, Math.PI, kitchenChair);
  b.cyl(0.16, 0.1, 0.07, b.mat('#f4efe6', { roughness: 0.4 }), 4.55, 0.75, 4.2);
  for (const [dx, dz, color] of [
    [-0.05, -0.03, '#e8483f'],
    [0.06, 0.02, '#f2c33a'],
    [0, 0.07, '#7bc96f'],
  ] as const) {
    b.ball(0.055, b.mat(color, { roughness: 0.5 }), 4.55 + dx, 0.86, 4.2 + dz);
  }
  b.cyl(0.17, 0.15, 0.5, mats.steel, 2.45, 0, 5.6, { solid: true });

  // ------------------------------------------------------------- garden
  for (const [x, z, s] of [
    [-9.8, 7.6, 1.1],
    [9.7, -7.3, 1.25],
    [9.8, 8.0, 0.95],
    [-9.9, -6.8, 1.0],
  ] as const) {
    b.cyl(0.12 * s, 0.16 * s, 1.1 * s, mats.bark, x, 0, z, { solid: true });
    b.ball(0.75 * s, mats.leaf, x, 1.55 * s, z).scale.set(1, 1.1, 1);
    b.ball(0.55 * s, mats.leafLight, x + 0.35 * s, 1.95 * s, z - 0.2 * s);
    b.ball(0.5 * s, mats.leaf, x - 0.3 * s, 1.9 * s, z + 0.25 * s);
  }
  for (const [x, z] of [
    [-6.5, 6.9],
    [-4.6, 6.85],
    [3.2, 6.9],
    [5.4, 6.85],
  ] as const) {
    b.ball(0.38, mats.leaf, x, 0.25, z).scale.set(1.3, 0.8, 1);
  }

  // ------------------------------------------------------------- lamps (smart lights)
  const lamps = {} as Record<RoomSlot, Lamp>;
  function addLamp(
    slot: RoomSlot,
    shade: THREE.MeshStandardMaterial,
    bulbAt: THREE.Vector3Tuple,
    glowAt: [number, number],
    glowSize: number,
    parts: THREE.Object3D[],
  ) {
    const bulb = b.own(
      new THREE.MeshStandardMaterial({
        color: '#fff7e0',
        emissive: '#ffc05a',
        emissiveIntensity: 0,
        roughness: 0.3,
      }),
    );
    const bulbMesh = b.ball(0.06, bulb, ...bulbAt, { shadow: false });
    const light = new THREE.PointLight('#ffc070', 0, 8, 1.5);
    light.position.set(bulbAt[0], bulbAt[1] + 0.05, bulbAt[2]);
    root.add(light);
    const glow = b.flat(
      glowSize,
      glowSize,
      b.own(
        new THREE.MeshBasicMaterial({
          map: glowTex,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      ),
      glowAt[0],
      0.03,
      glowAt[1],
    ) as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    glow.userData.noAO = true;
    for (const part of [...parts, bulbMesh]) {
      part.userData.lamp = slot;
      clickables.push(part);
    }
    lamps[slot] = { slot, bulb, shade, light, glow, level: 0, on: false };
  }
  const shadeMaterial = (color = '#f6ecd8') =>
    b.own(
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.7,
        side: THREE.DoubleSide,
        emissive: '#ffcf8a',
        emissiveIntensity: 0,
      }),
    );
  {
    const plate = b.box(0.04, 0.16, 0.12, mats.chrome, -2.1, 0.95, -3.4);
    const look = shadeMaterial();
    const shade = b.ball(0.08, look, -2.17, 1.07, -3.4);
    addLamp('restroom', look, [-2.18, 1.07, -3.4], [-4.6, -3.4], 5.2, [plate, shade]);
  }
  {
    const base = b.cyl(0.07, 0.09, 0.04, mats.chrome, 3.95, 0.48, -5.68);
    const stem = b.cyl(0.012, 0.012, 0.22, mats.chrome, 3.95, 0.52, -5.68);
    const look = shadeMaterial();
    const shade = b.cyl(0.1, 0.15, 0.18, look, 3.95, 0.68, -5.68, { segments: 24 });
    addLamp('bedroom', look, [3.95, 0.74, -5.68], [3.4, -4.0], 6, [base, stem, shade]);
  }
  {
    const base = b.cyl(0.14, 0.16, 0.03, mats.black, -6.45, 0, 5.45);
    const pole = b.cyl(0.015, 0.015, 1.25, mats.black, -6.45, 0.03, 5.45);
    const look = shadeMaterial();
    const shade = b.cyl(0.14, 0.22, 0.26, look, -6.45, 1.2, 5.45, { segments: 24 });
    addLamp('living_room', look, [-6.45, 1.27, 5.45], [-4.6, 3.8], 6.5, [base, pole, shade]);
  }
  {
    const cord = b.cyl(0.006, 0.006, 0.7, mats.black, 4.6, 1.75, 4.3, { shadow: false });
    const look = shadeMaterial('#3a464d');
    const shade = b.cyl(0.07, 0.24, 0.18, look, 4.6, 1.57, 4.3, { segments: 28 });
    addLamp('kitchen', look, [4.6, 1.56, 4.3], [4.6, 4.1], 4.4, [cord, shade]);
  }

  // ------------------------------------------------------------- door sensors
  const sensors: Sensor[] = [];
  const sensorSpots: (readonly [number, number, number])[] = [FRONT_DOOR.sensor];
  for (const slot of SLOTS) {
    const door = ROOM_PLANS[slot].door;
    if (door) sensorSpots.push(door.sensor);
  }
  for (const [x, y, z] of sensorSpots) {
    b.box(0.1, 0.08, 0.1, b.mat('#f4f6f7', { roughness: 0.4 }), x, y, z, { shadow: false });
    const led = b.own(
      new THREE.MeshStandardMaterial({
        color: '#7b8a92',
        emissive: '#22d3ee',
        emissiveIntensity: 0,
      }),
    );
    b.ball(0.018, led, x, y + 0.04, z + 0.05, { shadow: false });
    sensors.push({ led, position: new THREE.Vector3(x, y, z), flash: 0 });
  }

  // ------------------------------------------------------------- helpers
  function chair(x: number, z: number, rotY: number, look: THREE.Material) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    root.add(group);
    b.box(0.42, 0.05, 0.42, look, 0, 0.42, 0, { parent: group, r: 0.02 });
    b.box(0.42, 0.42, 0.04, look, 0, 0.47, -0.19, { parent: group, r: 0.02 });
    for (const [dx, dz] of [
      [-0.18, -0.18],
      [0.18, -0.18],
      [-0.18, 0.18],
      [0.18, 0.18],
    ] as const) {
      b.box(0.035, 0.42, 0.035, mats.walnut, dx, 0, dz, { parent: group });
    }
    b.solid(x - 0.22, z - 0.22, x + 0.22, z + 0.22);
  }

  function schoolBag(x: number, y: number, z: number) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = -0.3;
    root.add(group);
    b.box(0.44, 0.5, 0.24, b.mat('#3d6fd8', { roughness: 0.75 }), 0, 0, 0, {
      parent: group,
      r: 0.08,
    });
    b.box(0.32, 0.2, 0.06, b.mat('#f4c542', { roughness: 0.75 }), 0, 0.07, 0.14, {
      parent: group,
      r: 0.03,
    });
    const handle = b.mesh(
      new THREE.TorusGeometry(0.08, 0.018, 8, 20, Math.PI),
      b.mat('#2a4f9e'),
      [0, 0.5, 0],
      { parent: group },
    );
    handle.rotation.y = Math.PI / 2;
  }

  return {
    colliders: b.colliders,
    rooms,
    lamps,
    sensors,
    clickables,
    dispose: () => b.dispose(),
  };
}
