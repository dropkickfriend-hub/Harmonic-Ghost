/**
 * Harmonic stack synthesizer.
 *
 * A "voice" is one harmonic of the fundamental. Each voice runs two slightly
 * detuned sine oscillators panned across the stereo field so a single device
 * can spread the partials and let the listener's ear reconstruct the missing
 * fundamental.
 */

export interface VoiceOptions {
  fundamental: number;
  harmonics: number[];
  masterGain?: number;
  detuneCents?: number;
}

interface Voice {
  osc: OscillatorNode[];
  gain: GainNode;
  panner: StereoPannerNode;
}

export class HarmonicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: Voice[] = [];
  private playing = false;

  ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  start(opts: VoiceOptions, when = 0): void {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') void ctx.resume();
    this.stop(0);

    const { fundamental, harmonics, masterGain = 0.35, detuneCents = 4 } = opts;
    const startAt = ctx.currentTime + when;
    const count = harmonics.length;

    harmonics.forEach((h, i) => {
      const freq = fundamental * h;
      const pan = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;

      const panner = ctx.createStereoPanner();
      panner.pan.value = pan * 0.85;

      const gain = ctx.createGain();
      // Higher harmonics get attenuated to keep the stack from getting harsh.
      const harmonicGain = 1 / Math.sqrt(h);
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(harmonicGain, startAt + 0.08);

      const oscA = ctx.createOscillator();
      oscA.type = 'sine';
      oscA.frequency.value = freq;
      oscA.detune.value = -detuneCents;

      const oscB = ctx.createOscillator();
      oscB.type = 'sine';
      oscB.frequency.value = freq;
      oscB.detune.value = detuneCents;

      oscA.connect(gain);
      oscB.connect(gain);
      gain.connect(panner);
      panner.connect(this.master!);

      oscA.start(startAt);
      oscB.start(startAt);

      this.voices.push({ osc: [oscA, oscB], gain, panner });
    });

    this.master!.gain.cancelScheduledValues(ctx.currentTime);
    this.master!.gain.setValueAtTime(this.master!.gain.value, ctx.currentTime);
    this.master!.gain.linearRampToValueAtTime(masterGain, startAt + 0.15);
    this.playing = true;
  }

  setFundamental(fundamental: number, harmonics: number[]): void {
    if (!this.ctx || !this.playing) return;
    const t = this.ctx.currentTime;
    this.voices.forEach((v, i) => {
      const h = harmonics[i] ?? 1;
      const target = fundamental * h;
      v.osc.forEach((o) => o.frequency.exponentialRampToValueAtTime(Math.max(1, target), t + 0.08));
    });
  }

  stop(releaseSec = 0.12): void {
    if (!this.ctx || !this.master) {
      this.playing = false;
      return;
    }
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + releaseSec);

    const voices = this.voices;
    this.voices = [];
    this.playing = false;
    setTimeout(() => {
      voices.forEach((v) => {
        v.osc.forEach((o) => {
          try {
            o.stop();
          } catch {
            // Ignore: oscillator may already be stopped.
          }
          o.disconnect();
        });
        v.gain.disconnect();
        v.panner.disconnect();
      });
    }, Math.max(150, releaseSec * 1000 + 50));
  }

  dispose(): void {
    this.stop(0);
    this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }
}

// Skip h=1 so the fundamental is actually missing (that's the whole point).
export const defaultStack = [2, 3, 4, 5, 6, 7];
