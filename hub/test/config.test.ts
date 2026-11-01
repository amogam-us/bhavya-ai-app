import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

const env = (extra: Record<string, string> = {}) => ({
  MODEL_API_KEY: 'test-key-123456',
  ...extra,
});

describe('loadConfig', () => {
  it('shows the simulator with both views by default', () => {
    expect(loadConfig(env()).simulator).toEqual({ visible: true, view: 'both' });
  });

  it('reads the simulator options in any letter case', () => {
    const config = loadConfig(env({ SIMULATOR: ' Hide ', SIMULATOR_VIEW: 'SIMPLE' }));
    expect(config.simulator).toEqual({ visible: false, view: 'simple' });
  });

  it('rejects unknown simulator options with a clear message', () => {
    expect(() => loadConfig(env({ SIMULATOR_VIEW: 'vr' }))).toThrow('SIMULATOR_VIEW');
  });
});
