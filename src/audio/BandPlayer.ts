/**
 * Band-limited track player.
 *
 * Downloads a track once, decodes it, then plays a single biquad-bandpass
 * slice of it scheduled to a shared start timestamp. Used by nodes to render
 * their assigned slice of the host's source audio.
 */

import type { Band } from '../types';

export class BandPlayer {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private currentUrl: string | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private filterChain: BiquadFilterNode[] = [];

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  async preload(url: string): Promise<void> {
    if (this.currentUrl === url && this.buffer) return;
    const ctx = this.ensureCtx();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`track fetch failed: ${res.status}`);
    const bytes = await res.arrayBuffer();
    this.buffer = await ctx.decodeAudioData(bytes.slice(0));
    this.currentUrl = url;
  }

  isLoaded(url: string): boolean {
    return this.currentUrl === url && this.buffer !== null;
  }

  start(band: Band, startAtMs: number, offsetSec = 0): void {
    if (!this.buffer) throw new Error('no track loaded');
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') void ctx.resume();
    this.stop(0);

    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.loop = true;

    // Steeper roll-off than a single bandpass: cascade highpass + lowpass.
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = band.lo;
    hp.Q.value = 0.707;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = band.hi;
    lp.Q.value = 0.707;

    const peaking = ctx.createBiquadFilter();
    peaking.type = 'peaking';
    peaking.frequency.value = Math.sqrt(band.lo * band.hi);
    peaking.Q.value = 1.2;
    peaking.gain.value = 4;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    source.connect(hp);
    hp.connect(lp);
    lp.connect(peaking);
    peaking.connect(gain);
    gain.connect(ctx.destination);

    const delaySec = Math.max(0, (startAtMs - Date.now()) / 1000);
    const startAt = ctx.currentTime + delaySec;

    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(0.9, startAt + 0.05);

    source.start(startAt, offsetSec);

    this.source = source;
    this.gain = gain;
    this.filterChain = [hp, lp, peaking];
  }

  stop(releaseSec = 0.1): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (this.gain) {
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setValueAtTime(this.gain.gain.value, t);
      this.gain.gain.linearRampToValueAtTime(0, t + releaseSec);
    }
    const src = this.source;
    const gain = this.gain;
    const chain = this.filterChain;
    this.source = null;
    this.gain = null;
    this.filterChain = [];
    setTimeout(
      () => {
        try {
          src?.stop();
        } catch {
          // already stopped
        }
        src?.disconnect();
        gain?.disconnect();
        chain.forEach((n) => n.disconnect());
      },
      Math.max(120, releaseSec * 1000 + 40),
    );
  }

  dispose(): void {
    this.stop(0);
    this.ctx?.close();
    this.ctx = null;
    this.buffer = null;
    this.currentUrl = null;
  }
}
