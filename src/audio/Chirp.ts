/**
 * Acoustic chirp emitter + listener for proximity calibration.
 *
 * A node emits a short FM sweep in the 17–19 kHz band (near-inaudible to most
 * adults, captured fine by phone mics). The host (or any listener) opens a
 * mic stream during a known time window, bandpasses to 16–20 kHz, and reads
 * the envelope peak. Peak amplitude is used as a relative-distance proxy
 * (higher = closer) — not metric distance, but enough to rank phones.
 *
 * Why amplitude rather than time-of-arrival: phones don't share a clock, and
 * sub-millisecond clock sync over WebSocket isn't achievable. Inverse-square
 * amplitude gives a usable ranking without timing.
 */

const CHIRP_F_LO = 17000;
const CHIRP_F_HI = 19000;
const CHIRP_DURATION_SEC = 0.25;

export function emitChirp(at: AudioContext, startAt: number): void {
  const osc = at.createOscillator();
  const gain = at.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(CHIRP_F_LO, startAt);
  osc.frequency.exponentialRampToValueAtTime(CHIRP_F_HI, startAt + CHIRP_DURATION_SEC);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(0.85, startAt + 0.01);
  gain.gain.setValueAtTime(0.85, startAt + CHIRP_DURATION_SEC - 0.02);
  gain.gain.linearRampToValueAtTime(0, startAt + CHIRP_DURATION_SEC);
  osc.connect(gain);
  gain.connect(at.destination);
  osc.start(startAt);
  osc.stop(startAt + CHIRP_DURATION_SEC + 0.05);
}

export interface ListenerHandle {
  stop: () => void;
  // peakSince returns the maximum 16–20kHz envelope value observed since the
  // given AudioContext time (in seconds). Used by the host to score each
  // node's chirp arrival within the known emission window.
  peakSince: (sinceCtxTime: number, untilCtxTime: number) => number;
  ctx: AudioContext;
}

export async function startListener(): Promise<ListenerHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();
  const source = ctx.createMediaStreamSource(stream);

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 16000;
  hp.Q.value = 0.707;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 20000;
  lp.Q.value = 0.707;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;

  source.connect(hp);
  hp.connect(lp);
  lp.connect(analyser);

  const buf = new Float32Array(analyser.fftSize);
  // Ring buffer of (ctxTime, rms) so we can query peak inside any window.
  const samples: { t: number; v: number }[] = [];
  const MAX_SAMPLES = 4096;
  let raf: number | null = null;

  const tick = () => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    samples.push({ t: ctx.currentTime, v: rms });
    if (samples.length > MAX_SAMPLES) samples.shift();
    raf = requestAnimationFrame(tick);
  };
  tick();

  return {
    ctx,
    peakSince: (since, until) => {
      let peak = 0;
      for (const s of samples) {
        if (s.t >= since && s.t <= until && s.v > peak) peak = s.v;
      }
      return peak;
    },
    stop: () => {
      if (raf !== null) cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
