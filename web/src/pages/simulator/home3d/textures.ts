import * as THREE from 'three';

/*
 * Procedural textures drawn on a canvas, so the simulator needs no image
 * files. A seeded random generator keeps them the same on every load.
 */

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(width: number, height = width): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const context = element.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not available.');
  return [element, context];
}

/** Lightens (amount > 0) or darkens (amount < 0) a hex colour. */
export function shade(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => {
    const target = amount > 0 ? 255 : 0;
    return Math.round(c + (target - c) * Math.abs(amount));
  });
  return `rgb(${channels.join(',')})`;
}

function speckle(
  g: CanvasRenderingContext2D,
  size: number,
  count: number,
  alpha: number,
  rand: () => number,
) {
  for (let i = 0; i < count; i++) {
    const light = rand() > 0.5;
    g.fillStyle = light ? `rgba(255,255,255,${alpha * rand()})` : `rgba(0,0,0,${alpha * rand()})`;
    g.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
  }
}

function finish(element: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  return texture;
}

/** Oak planks. One texture covers 2 × 2 m. */
export function woodFloor(): THREE.CanvasTexture {
  const size = 1024;
  const [element, g] = canvas(size);
  const rand = seeded(11);
  const tones = ['#c99f72', '#c09366', '#cfa67b', '#ba8b5f', '#d4ae84', '#c49a6d'];
  const rows = 10;
  const rowHeight = size / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rowHeight;
    let x = -rand() * size * 0.6;
    while (x < size) {
      const length = size * (0.4 + rand() * 0.55);
      g.fillStyle = tones[Math.floor(rand() * tones.length)] ?? '#c99f72';
      g.fillRect(x, y, length, rowHeight);
      g.lineWidth = 1;
      for (let k = 0; k < 9; k++) {
        const y0 = y + 3 + rand() * (rowHeight - 6);
        const wave = 50 + rand() * 70;
        g.strokeStyle = `rgba(95,58,28,${0.06 + rand() * 0.08})`;
        g.beginPath();
        g.moveTo(x, y0);
        for (let t = 0; t <= length; t += 16)
          g.lineTo(x + t, y0 + Math.sin((t + k * 37) / wave) * 2.5);
        g.stroke();
      }
      g.fillStyle = 'rgba(70,40,15,0.45)';
      g.fillRect(x + length - 1.5, y, 2, rowHeight);
      x += length;
    }
    g.fillStyle = 'rgba(70,40,15,0.4)';
    g.fillRect(0, y, size, 2);
  }
  speckle(g, size, 5000, 0.05, rand);
  return finish(element);
}

/** Square tiles with grout. `count` tiles across one texture. */
export function tiles(base: string, grout: string, count: number, seed = 3): THREE.CanvasTexture {
  const size = 1024;
  const [element, g] = canvas(size);
  const rand = seeded(seed);
  const step = size / count;
  const gap = Math.max(2, step * 0.045);
  g.fillStyle = grout;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      g.fillStyle = shade(base, (rand() - 0.5) * 0.08);
      g.fillRect(i * step + gap / 2, j * step + gap / 2, step - gap, step - gap);
      // A soft highlight makes each tile read as glazed.
      const gradient = g.createLinearGradient(i * step, j * step, (i + 1) * step, (j + 1) * step);
      gradient.addColorStop(0, 'rgba(255,255,255,0.10)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.04)');
      g.fillStyle = gradient;
      g.fillRect(i * step + gap / 2, j * step + gap / 2, step - gap, step - gap);
    }
  }
  speckle(g, size, 3000, 0.04, rand);
  return finish(element);
}

/** Soft carpet or rug. */
export function carpet(base: string, seed = 5): THREE.CanvasTexture {
  const size = 512;
  const [element, g] = canvas(size);
  const rand = seeded(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  speckle(g, size, 26000, 0.12, rand);
  return finish(element);
}

/** Woven fabric for sofas, bedding and curtains. */
export function fabric(base: string, seed = 9): THREE.CanvasTexture {
  const size = 256;
  const [element, g] = canvas(size);
  const rand = seeded(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  g.lineWidth = 1;
  for (let i = 0; i < size; i += 3) {
    g.strokeStyle = `rgba(255,255,255,${0.04 + rand() * 0.04})`;
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, size);
    g.stroke();
    g.strokeStyle = `rgba(0,0,0,${0.03 + rand() * 0.04})`;
    g.beginPath();
    g.moveTo(0, i + 1);
    g.lineTo(size, i + 1);
    g.stroke();
  }
  return finish(element);
}

/** Matte wall paint with a faint roller texture. */
export function paint(base: string, seed = 13): THREE.CanvasTexture {
  const size = 512;
  const [element, g] = canvas(size);
  const rand = seeded(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  speckle(g, size, 9000, 0.03, rand);
  return finish(element);
}

/** Garden lawn. */
export function grass(): THREE.CanvasTexture {
  const size = 512;
  const [element, g] = canvas(size);
  const rand = seeded(21);
  g.fillStyle = '#7fae6a';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    g.strokeStyle = shade('#6f9f5b', (rand() - 0.5) * 0.35);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 3, y - 2 - rand() * 4);
    g.stroke();
  }
  return finish(element);
}

/** Paving stones for the garden path. */
export function paving(): THREE.CanvasTexture {
  return tiles('#d9d4c9', '#b9b2a4', 4, 31);
}

/** Daylight seen through a window. */
export function sky(): THREE.CanvasTexture {
  const [element, g] = canvas(64, 128);
  const gradient = g.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, '#9fd0f2');
  gradient.addColorStop(0.7, '#d9eefa');
  gradient.addColorStop(1, '#f3f8ec');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 128);
  return finish(element, false);
}

/** Warm pool of light on the floor under a lamp. */
export function glow(): THREE.CanvasTexture {
  const size = 256;
  const [element, g] = canvas(size);
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,190,90,1)');
  gradient.addColorStop(0.5, 'rgba(255,196,100,0.5)');
  gradient.addColorStop(1, 'rgba(255,196,100,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  return finish(element, false);
}
