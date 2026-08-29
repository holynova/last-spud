/** WebAudio 合成音效（自原生版移植），同类音效带最小间隔闸门 */
export class AudioService {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private gates = new Map<string, number>();

  init(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch { /* 无音频环境静默 */ }
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }

  private gate(key: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.gates.get(key) ?? 0) < ms) return false;
    this.gates.set(key, now);
    return true;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol = 0.5, delay = 0): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol = 0.4): void {
    if (!this.ctx || !this.master || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start();
  }

  // 命名音效（带闸门）
  shoot(): void { if (!this.gate('shoot', 40)) return; this.tone('square', 620, 180, 0.08, 0.12); }
  shotgun(): void { if (!this.gate('shotgun', 80)) return; this.noise(0.14, 0.3); this.tone('square', 300, 80, 0.14, 0.2); }
  laser(): void { if (!this.gate('laser', 80)) return; this.tone('sawtooth', 1200, 300, 0.16, 0.16); }
  melee(): void { if (!this.gate('melee', 60)) return; this.tone('triangle', 240, 90, 0.1, 0.25); }
  aura(): void { if (!this.gate('aura', 80)) return; this.tone('sine', 500, 900, 0.14, 0.14); }
  hit(): void { if (!this.gate('hit', 45)) return; this.tone('triangle', 260, 140, 0.05, 0.14); }
  kill(): void { if (!this.gate('kill', 60)) return; this.tone('square', 200, 60, 0.12, 0.16); this.noise(0.1, 0.14); }
  pickup(): void { if (!this.gate('pickup', 35)) return; this.tone('sine', 880, 1320, 0.07, 0.12); }
  heart(): void { this.tone('sine', 660, 990, 0.1, 0.2); this.tone('sine', 990, 1320, 0.12, 0.2, 0.08); }
  hurt(): void { if (!this.gate('hurt', 100)) return; this.tone('sawtooth', 220, 60, 0.22, 0.4); this.noise(0.16, 0.3); }
  heartbeat(): void { if (!this.gate('heartbeat', 750)) return; this.tone('sine', 55, 40, 0.12, 0.6); }
  boom(): void { this.noise(0.35, 0.5); this.tone('sawtooth', 140, 40, 0.35, 0.4); }
  levelup(): void { [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.12, 0.2, i * 0.09)); }
  buy(): void { this.tone('sine', 990, 990, 0.06, 0.2); this.tone('sine', 1480, 1480, 0.1, 0.2, 0.06); }
  waveStart(): void { [392, 523, 659].forEach((f, i) => this.tone('triangle', f, f, 0.15, 0.22, i * 0.12)); }
  win(): void { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.25, i * 0.14)); }
  lose(): void { [400, 330, 260, 180].forEach((f, i) => this.tone('sawtooth', f, f * 0.9, 0.3, 0.25, i * 0.22)); }
}
