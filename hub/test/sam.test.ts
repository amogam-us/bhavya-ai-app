import { describe, expect, it } from 'vitest';
import { parseSamBoxes } from '../src/muse/sam';

describe('parseSamBoxes', () => {
  it('converts pixel boxes to normalized boxes, best first', () => {
    const output =
      '<0f>0<|box;x1=866;y1=413;x2=1496;y2=968;w=1920;h=1280;c=0.5|><|mask;x=0;y=0;data=abc|>' +
      '1<|box;x1=0;y1=0;x2=960;y2=640;w=1920;h=1280;c=0.9|>';
    const boxes = parseSamBoxes(output);
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toEqual({ x: 0, y: 0, width: 0.5, height: 0.5, confidence: 0.9 });
    expect(boxes[1]!.x).toBeCloseTo(866 / 1920);
    expect(boxes[1]!.height).toBeCloseTo((968 - 413) / 1280);
  });

  it('drops low-confidence and malformed boxes', () => {
    const output =
      '<|box;x1=1;y1=1;x2=5;y2=5;w=10;h=10;c=0.1|>' +
      '<|box;x1=1;y1=1;x2=5;w=10;h=10|>' +
      '<|box;x1=5;y1=5;x2=5;y2=9;w=10;h=10|>';
    expect(parseSamBoxes(output)).toEqual([]);
  });

  it('returns nothing when SAM found no match', () => {
    expect(parseSamBoxes('<0f>')).toEqual([]);
  });
});
