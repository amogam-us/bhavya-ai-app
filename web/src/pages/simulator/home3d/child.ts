import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Builder } from './builder';

const SKIN = '#e5b48c';
const SHIRT = '#2f80c8';
const SHORTS = '#2c3e66';
const SHOES = '#f2f2f0';
const HAIR = '#2b1d14';

interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
}

/**
 * The child, wearing smart glasses. The glasses show a small green light and a
 * faint view cone only while the camera is allowed, so privacy is visible.
 */
export class ChildFigure {
  readonly group = new THREE.Group();
  readonly bubbleEl = document.createElement('div');
  private readonly builder: Builder;
  private readonly body = new THREE.Group();
  private readonly legs: [Limb, Limb];
  private readonly arms: [Limb, Limb];
  private readonly led: THREE.MeshStandardMaterial;
  private readonly cone: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  private readonly bubble: CSS2DObject;
  private phase = 0;
  private coneFlash = 0;

  constructor() {
    const b = (this.builder = new Builder(this.body));
    this.group.add(this.body);
    this.body.scale.setScalar(0.92);

    // Legs: hip and knee joints.
    this.legs = [this.leg(b, -0.08), this.leg(b, 0.08)];
    b.box(0.3, 0.17, 0.19, SHORTS, 0, 0.66, 0, { r: 0.07 });

    // Torso, neck and head.
    const torso = b.mesh(new THREE.CapsuleGeometry(0.155, 0.26, 6, 18), SHIRT, [0, 1.0, 0]);
    torso.scale.set(1, 1, 0.78);
    b.cyl(0.045, 0.05, 0.09, SKIN, 0, 1.22, 0);
    const head = b.ball(0.15, SKIN, 0, 1.42, 0);
    head.scale.set(1, 1.08, 1);
    const hair = b.mesh(
      new THREE.SphereGeometry(0.158, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
      HAIR,
      [0, 1.44, -0.012],
    );
    hair.rotation.x = -0.25;
    b.ball(0.07, HAIR, 0, 1.52, 0.1).scale.set(1.6, 0.6, 0.8);
    for (const x of [-0.152, 0.152]) b.ball(0.03, SKIN, x, 1.42, 0);
    for (const x of [-0.05, 0.05]) b.ball(0.014, '#1d1d1d', x, 1.44, 0.138, { shadow: false });
    b.ball(0.016, SKIN, 0, 1.405, 0.15, { shadow: false });

    // Smart glasses: frame, bridge, temples and a privacy light.
    const frame = b.mat('#141619', { roughness: 0.35 });
    for (const x of [-0.056, 0.056]) {
      b.box(0.088, 0.056, 0.016, frame, x, 1.418, 0.146, { r: 0.012, shadow: false });
      b.box(
        0.068,
        0.038,
        0.006,
        b.mat('#27313a', { roughness: 0.05, metalness: 0.4 }),
        x,
        1.427,
        0.156,
        {
          shadow: false,
        },
      );
    }
    b.box(0.028, 0.01, 0.012, frame, 0, 1.452, 0.15, { shadow: false });
    for (const x of [-0.104, 0.104])
      b.box(0.01, 0.012, 0.16, frame, x, 1.44, 0.07, { shadow: false });
    this.led = b.own(
      new THREE.MeshStandardMaterial({
        color: '#8b959e',
        emissive: '#22c55e',
        emissiveIntensity: 0,
      }),
    );
    b.ball(0.009, this.led, 0.094, 1.468, 0.156, { shadow: false });

    // Arms: shoulder and elbow joints.
    this.arms = [this.arm(b, -0.2), this.arm(b, 0.2)];

    // What the glasses camera can see.
    const view = new THREE.Group();
    view.position.set(0, 1.43, 0.16);
    view.rotation.x = 0.38;
    this.body.add(view);
    this.cone = new THREE.Mesh(
      b.own(new THREE.ConeGeometry(0.75, 2.2, 36, 1, true)),
      b.own(
        new THREE.MeshBasicMaterial({
          color: '#4fc3f7',
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      ),
    );
    this.cone.rotation.x = -Math.PI / 2;
    this.cone.position.z = 1.1;
    this.cone.userData.noAO = true;
    view.add(this.cone);

    this.bubbleEl.className = 'sim3d-bubble';
    this.bubble = new CSS2DObject(this.bubbleEl);
    this.bubble.position.set(0, 1.85, 0);
    this.group.add(this.bubble);
  }

  /** Shows a line above the child's head, or nothing. */
  setBubble(text: string | null): void {
    if (this.bubbleEl.textContent !== (text ?? '')) this.bubbleEl.textContent = text ?? '';
    this.bubble.visible = !!text;
  }

  /** Makes the view cone pulse once, for a look around. */
  flashView(): void {
    this.coneFlash = 1;
  }

  /**
   * Animates the walk cycle and the glasses. `speed` is in metres per second
   * (0 when standing).
   */
  update(dt: number, t: number, speed: number, cameraOn: boolean, looking: boolean): void {
    const walking = speed > 0.05;
    if (walking) this.phase += dt * (3.2 + speed * 1.6);
    const ease = Math.min(1, dt * 12);
    const swing = walking ? Math.sin(this.phase) : 0;
    const stride = Math.min(0.75, 0.3 + speed * 0.15);

    const [legL, legR] = this.legs;
    const [armL, armR] = this.arms;
    const turn = (group: THREE.Group, target: number) => {
      group.rotation.x += (target - group.rotation.x) * ease;
    };
    turn(legL.upper, -swing * stride);
    turn(legR.upper, swing * stride);
    // The knee bends while the leg pushes off behind the body.
    turn(legL.lower, walking ? Math.max(0, -swing) * 0.9 : 0);
    turn(legR.lower, walking ? Math.max(0, swing) * 0.9 : 0);
    turn(armL.upper, swing * stride * 0.8);
    turn(armR.upper, -swing * stride * 0.8);
    turn(armL.lower, -0.25 - (walking ? 0.2 : 0));
    turn(armR.lower, -0.25 - (walking ? 0.2 : 0));

    this.body.position.y = walking
      ? Math.abs(Math.sin(this.phase)) * 0.035
      : Math.sin(t * 2) * 0.004;
    this.body.rotation.x += ((walking ? 0.06 : 0) - this.body.rotation.x) * ease;

    this.led.emissiveIntensity = cameraOn ? 1.4 + Math.sin(t * 4) * 0.4 : 0;
    this.led.color.set(cameraOn ? '#22c55e' : '#8b959e');
    this.coneFlash = Math.max(0, this.coneFlash - dt * 1.3);
    const target = cameraOn && looking ? 0.09 + Math.sin(t * 3) * 0.025 + this.coneFlash * 0.2 : 0;
    const material = this.cone.material;
    material.opacity += (target - material.opacity) * Math.min(1, dt * 6);
    this.cone.visible = material.opacity > 0.004;
  }

  dispose(): void {
    this.builder.dispose();
    this.group.removeFromParent();
  }

  private leg(b: Builder, x: number): Limb {
    const upper = new THREE.Group();
    upper.position.set(x, 0.68, 0);
    this.body.add(upper);
    b.mesh(new THREE.CapsuleGeometry(0.062, 0.2, 4, 12), SHORTS, [0, -0.15, 0], { parent: upper });
    const lower = new THREE.Group();
    lower.position.set(0, -0.3, 0);
    upper.add(lower);
    b.mesh(new THREE.CapsuleGeometry(0.052, 0.22, 4, 12), SKIN, [0, -0.15, 0], { parent: lower });
    b.box(0.1, 0.07, 0.19, SHOES, 0, -0.38, 0.03, { parent: lower, r: 0.03 });
    return { upper, lower };
  }

  private arm(b: Builder, x: number): Limb {
    const upper = new THREE.Group();
    upper.position.set(x, 1.15, 0);
    upper.rotation.z = x < 0 ? 0.08 : -0.08;
    this.body.add(upper);
    b.mesh(new THREE.CapsuleGeometry(0.045, 0.14, 4, 12), SHIRT, [0, -0.1, 0], { parent: upper });
    const lower = new THREE.Group();
    lower.position.set(0, -0.22, 0);
    upper.add(lower);
    b.mesh(new THREE.CapsuleGeometry(0.038, 0.14, 4, 12), SKIN, [0, -0.1, 0], { parent: lower });
    b.ball(0.044, SKIN, 0, -0.22, 0.01, { parent: lower });
    return { upper, lower };
  }
}
