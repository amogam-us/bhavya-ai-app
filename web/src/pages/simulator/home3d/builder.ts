import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** An obstacle footprint on the floor, for walking. */
export interface Box2 {
  x1: number;
  x2: number;
  z1: number;
  z2: number;
}

export type Look = string | THREE.Material;

export interface PartOptions {
  parent?: THREE.Object3D;
  /** Corner radius, for boxes. */
  r?: number;
  /** Adds the footprint as an obstacle. Only for parts placed directly in the scene. */
  solid?: boolean;
  /** Turn around the vertical axis, in radians. */
  rotY?: number;
  /** Casts a shadow (default true). */
  shadow?: boolean;
}

/**
 * Creates meshes from simple shapes, reuses materials, remembers obstacle
 * footprints, and disposes of everything it made in one call.
 */
export class Builder {
  readonly colliders: Box2[] = [];
  private readonly owned: { dispose(): void }[] = [];
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();

  constructor(readonly root: THREE.Object3D) {}

  own<T extends { dispose(): void }>(item: T): T {
    this.owned.push(item);
    return item;
  }

  /** A shared standard material for a colour (and optional settings). */
  mat(color: string, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
    const key = `${color}|${JSON.stringify(extra, (_key, value: unknown) =>
      value instanceof THREE.Texture ? value.uuid : value,
    )}`;
    let material = this.materials.get(key);
    if (!material) {
      material = this.own(
        new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...extra }),
      );
      this.materials.set(key, material);
    }
    return material;
  }

  mesh(
    geometry: THREE.BufferGeometry,
    look: Look,
    position: THREE.Vector3Tuple,
    options: PartOptions = {},
  ): THREE.Mesh {
    const material = typeof look === 'string' ? this.mat(look) : look;
    const mesh = new THREE.Mesh(this.own(geometry), material);
    mesh.position.set(...position);
    if (options.rotY) mesh.rotation.y = options.rotY;
    const shadow = options.shadow ?? true;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    (options.parent ?? this.root).add(mesh);
    return mesh;
  }

  /** A box standing on y (its bottom), centred on x and z. */
  box(
    w: number,
    h: number,
    d: number,
    look: Look,
    x: number,
    y: number,
    z: number,
    options: PartOptions = {},
  ): THREE.Mesh {
    const radius = options.r ? Math.min(options.r, w / 2, h / 2, d / 2) * 0.999 : 0;
    const geometry =
      radius > 0.001 ? new RoundedBoxGeometry(w, h, d, 3, radius) : new THREE.BoxGeometry(w, h, d);
    const mesh = this.mesh(geometry, look, [x, y + h / 2, z], options);
    if (options.solid) {
      const turned = Math.abs(Math.sin(options.rotY ?? 0)) > 0.7;
      const hw = (turned ? d : w) / 2;
      const hd = (turned ? w : d) / 2;
      this.solid(x - hw, z - hd, x + hw, z + hd);
    }
    return mesh;
  }

  /** A cylinder standing on y (its bottom). */
  cyl(
    rTop: number,
    rBottom: number,
    h: number,
    look: Look,
    x: number,
    y: number,
    z: number,
    options: PartOptions & { segments?: number } = {},
  ): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(rTop, rBottom, h, options.segments ?? 32);
    const mesh = this.mesh(geometry, look, [x, y + h / 2, z], options);
    if (options.solid) {
      const r = Math.max(rTop, rBottom);
      this.solid(x - r, z - r, x + r, z + r);
    }
    return mesh;
  }

  /** A sphere centred on (x, y, z). */
  ball(
    r: number,
    look: Look,
    x: number,
    y: number,
    z: number,
    options: PartOptions = {},
  ): THREE.Mesh {
    return this.mesh(new THREE.SphereGeometry(r, 28, 18), look, [x, y, z], options);
  }

  /** A flat rectangle lying on the floor at height y. */
  flat(
    w: number,
    d: number,
    look: Look,
    x: number,
    y: number,
    z: number,
    options: PartOptions = {},
  ) {
    const mesh = this.mesh(new THREE.PlaneGeometry(w, d), look, [x, y, z], {
      ...options,
      shadow: false,
    });
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  solid(x1: number, z1: number, x2: number, z2: number): void {
    this.colliders.push({
      x1: Math.min(x1, x2),
      x2: Math.max(x1, x2),
      z1: Math.min(z1, z2),
      z2: Math.max(z1, z2),
    });
  }

  dispose(): void {
    for (const item of this.owned) item.dispose();
    this.owned.length = 0;
    this.materials.clear();
  }
}

/** A texture repeated `x` by `y` times; the copy shares the image. */
export function repeated(texture: THREE.Texture, x: number, y: number): THREE.Texture {
  const copy = texture.clone();
  copy.repeat.set(x, y);
  copy.needsUpdate = true;
  return copy;
}
