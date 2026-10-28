import type { ObjectBox } from '@bhavya/shared';

/**
 * Parses SAM 3.1 token output into normalized boxes.
 *
 * SAM returns one line per frame made of special tokens, for example:
 *   <0f>0<|box;x1=866;y1=413;x2=1496;y2=968;w=1920;h=1280;c=0.97|><|mask;...|>
 * Box coordinates are pixels in the source image; w and h give its size.
 * Masks are ignored: the child app only draws boxes.
 */
export function parseSamBoxes(output: string, minConfidence = 0.3): ObjectBox[] {
  const boxes: ObjectBox[] = [];
  for (const match of output.matchAll(/<\|box;([^|]*)\|>/g)) {
    const fields = parseFields(match[1] ?? '');
    const { x1, y1, x2, y2, w, h } = fields;
    if ([x1, y1, x2, y2, w, h].some((v) => v === undefined || !Number.isFinite(v))) continue;
    if (!w || !h || w <= 0 || h <= 0) continue;
    const confidence = fields.c ?? 1;
    if (confidence < minConfidence) continue;
    const left = clamp01(Math.min(x1!, x2!) / w);
    const top = clamp01(Math.min(y1!, y2!) / h);
    const right = clamp01(Math.max(x1!, x2!) / w);
    const bottom = clamp01(Math.max(y1!, y2!) / h);
    if (right - left <= 0 || bottom - top <= 0) continue;
    boxes.push({ x: left, y: top, width: right - left, height: bottom - top, confidence });
  }
  return boxes.sort((a, b) => b.confidence - a.confidence);
}

function parseFields(raw: string): Record<string, number | undefined> {
  const fields: Record<string, number | undefined> = {};
  for (const pair of raw.split(';')) {
    const [key, value] = pair.split('=');
    if (key && value !== undefined) fields[key.trim()] = Number(value);
  }
  return fields;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
