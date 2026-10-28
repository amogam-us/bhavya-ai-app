/** A soft, slowly breathing chord made with Web Audio. Returns a function that fades it out. */
export function startCalmMusic(ctx: AudioContext, volume: number): () => void {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.07 * volume, ctx.currentTime + 2);
  master.connect(ctx.destination);

  const sources: OscillatorNode[] = [];
  [130.81, 196.0, 261.63, 329.63].forEach((frequency, i) => {
    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = frequency;
    const toneGain = ctx.createGain();
    toneGain.gain.value = 0.5;

    // Each note swells at its own slow pace, so the chord gently moves.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05 + i * 0.03;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.25;
    lfo.connect(lfoDepth).connect(toneGain.gain);

    tone.connect(toneGain).connect(master);
    tone.start();
    lfo.start();
    sources.push(tone, lfo);
  });

  return () => {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 1);
    sources.forEach((s) => s.stop(now + 1.1));
    setTimeout(() => master.disconnect(), 1300);
  };
}
