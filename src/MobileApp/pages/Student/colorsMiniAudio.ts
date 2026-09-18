export function playKidBeep(n: number, soundEnabled = true) {
  if (!soundEnabled) return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = n === 0 ? 880 : 520 + (5 - Math.min(n, 5)) * 80;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
    window.setTimeout(() => void ctx.close(), 250);
  } catch {
    // ignore
  }
}

/** Short burst so tapping a balloon feels like a pop. */
export function playBalloonPopSound(soundEnabled = true) {
  if (!soundEnabled) return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const noiseLen = 0.12;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseLen), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 900;
    band.Q.value = 0.7;
    const master = ctx.createGain();
    master.gain.value = 1.35;
    const punch = ctx.createDynamicsCompressor();
    punch.threshold.value = -18;
    punch.knee.value = 6;
    punch.ratio.value = 3;
    punch.attack.value = 0.003;
    punch.release.value = 0.08;
    punch.connect(master);
    master.connect(ctx.destination);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.85, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + noiseLen);
    noise.connect(band);
    band.connect(noiseGain);
    noiseGain.connect(punch);

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.14);
    oscGain.gain.setValueAtTime(0.55, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);
    osc.connect(oscGain);
    oscGain.connect(punch);

    noise.start(now);
    osc.start(now);
    noise.stop(now + noiseLen);
    osc.stop(now + 0.16);
    window.setTimeout(() => void ctx.close(), 280);
  } catch {
    // ignore
  }
}
