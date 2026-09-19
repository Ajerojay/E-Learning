/** Bell ring with a soft pop, rising C–E–G as each star appears. */
export function playStarPopSound(index: number, fill: "full" | "half" | "empty") {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    void ctx.resume();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    const freq = notes[Math.max(0, Math.min(2, index))] ?? notes[0];
    const bright = fill === "empty" ? 0.42 : fill === "half" ? 0.74 : 1;

    const master = ctx.createGain();
    master.gain.value = 0.95;
    master.connect(ctx.destination);

    const strike = (partial: number, type: OscillatorType, peak: number, decay: number) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq * partial, now);
      osc.frequency.exponentialRampToValueAtTime(freq * partial * 0.985, now + decay);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak * bright, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + decay + 0.02);
    };

    // Warm bell body + inharmonic ring.
    strike(1, "sine", 0.34, 0.72);
    strike(2.76, "sine", 0.14, 0.55);
    strike(5.4, "sine", 0.06, 0.38);
    strike(2, "triangle", 0.08, 0.22);

    // Soft pop / click at the start.
    const pop = ctx.createOscillator();
    pop.type = "sine";
    pop.frequency.setValueAtTime(240, now);
    pop.frequency.exponentialRampToValueAtTime(90, now + 0.05);
    const popGain = ctx.createGain();
    popGain.gain.setValueAtTime(0.0001, now);
    popGain.gain.exponentialRampToValueAtTime(0.22 * bright, now + 0.006);
    popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    pop.connect(popGain);
    popGain.connect(master);
    pop.start(now);
    pop.stop(now + 0.08);

    const noiseLen = 0.045;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseLen), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    }
    const spark = ctx.createBufferSource();
    spark.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2200;
    band.Q.value = 1.4;
    const sparkGain = ctx.createGain();
    sparkGain.gain.setValueAtTime(0.16 * bright, now);
    sparkGain.gain.exponentialRampToValueAtTime(0.001, now + noiseLen);
    spark.connect(band);
    band.connect(sparkGain);
    sparkGain.connect(master);
    spark.start(now);
    spark.stop(now + noiseLen);

    window.setTimeout(() => void ctx.close(), 820);
  } catch {
    // ignore
  }
}
