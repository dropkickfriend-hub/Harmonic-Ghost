function autoCorrelate(buf: Float32Array, sampleRate: number): number {
  let size = buf.length;
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return -1;

  const thres = 0.2;
  let r1 = 0;
  let r2 = size - 1;
  for (let i = 0; i < size / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < size / 2; i++) if (Math.abs(buf[size - i]) < thres) { r2 = size - i; break; }

  buf = buf.slice(r1, r2);
  size = buf.length;
  const c = new Array(size).fill(0);
  for (let i = 0; i < size; i++) for (let j = 0; j < size - i; j++) c[i] += buf[j] * buf[j + i];

  let d = 0;
  while (d < size - 1 && c[d] > c[d + 1]) d++;

  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < size; i++) {
    if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  }
  if (maxpos <= 0) return -1;
  return sampleRate / maxpos;
}

export interface PitchDetectorHandle {
  stop: () => void;
}

export async function startPitchDetector(opts: {
  onPitch: (hz: number) => void;
  minHz?: number;
  maxHz?: number;
}): Promise<PitchDetectorHandle> {
  const { onPitch, minHz = 40, maxHz = 1000 } = opts;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const Ctor =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const buffer = new Float32Array(analyser.fftSize);
  let frame = 0;
  let smoothed = 0;
  let raf: number | null = null;

  const tick = () => {
    analyser.getFloatTimeDomainData(buffer);
    const pitch = autoCorrelate(buffer, ctx.sampleRate);
    if (pitch > minHz && pitch < maxHz) {
      smoothed = smoothed === 0 ? pitch : smoothed * 0.7 + pitch * 0.3;
      if (frame % 6 === 0) onPitch(Math.round(smoothed));
    }
    frame++;
    raf = requestAnimationFrame(tick);
  };
  tick();

  return {
    stop: () => {
      if (raf !== null) cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
