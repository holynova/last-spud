// ============ 极简 WebAudio 合成音效 ============
const Sfx = {
  ctx: null,
  master: null,
  muted: false,
  _gates: {}, // 同类音效最小间隔，防止高频开火时节点爆炸

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch (e) { /* 无音频环境时静默 */ }
  },
  // 节流闸门：key 类音效在 ms 内只放行一次
  gate(key, ms) {
    const now = performance.now();
    if (now - (this._gates[key] || 0) < ms) return false;
    this._gates[key] = now;
    return true;
  },
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  },
  // 基础音符：type 波形，f0->f1 频率滑动，dur 时长，vol 音量
  tone(type, f0, f1, dur, vol = 0.5, delay = 0) {
    if (!this.ctx || this.muted) return;
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
  },
  noise(dur, vol = 0.4, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start(t0);
  },

  shoot()  { if (!this.gate('shoot', 40)) return; this.tone('square', 620, 180, 0.08, 0.12); },
  shotgun(){ if (!this.gate('shotgun', 80)) return; this.noise(0.14, 0.3); this.tone('square', 300, 80, 0.14, 0.2); },
  laser()  { if (!this.gate('laser', 80)) return; this.tone('sawtooth', 1200, 300, 0.16, 0.16); },
  melee()  { if (!this.gate('melee', 60)) return; this.tone('triangle', 240, 90, 0.1, 0.25); },
  aura()   { if (!this.gate('aura', 80)) return; this.tone('sine', 500, 900, 0.14, 0.14); },
  hit()    { if (!this.gate('hit', 45)) return; this.tone('triangle', 260, 140, 0.05, 0.14); },
  kill()   { if (!this.gate('kill', 60)) return; this.tone('square', 200, 60, 0.12, 0.16); this.noise(0.1, 0.14); },
  pickup() { if (!this.gate('pickup', 35)) return; this.tone('sine', 880, 1320, 0.07, 0.12); },
  heart()  { this.tone('sine', 660, 990, 0.1, 0.2); this.tone('sine', 990, 1320, 0.12, 0.2, 0.08); },
  hurt()   { if (!this.gate('hurt', 100)) return; this.tone('sawtooth', 220, 60, 0.22, 0.4); this.noise(0.16, 0.3); },
  levelup(){ [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.12, 0.2, i * 0.09)); },
  buy()    { this.tone('sine', 990, 990, 0.06, 0.2); this.tone('sine', 1480, 1480, 0.1, 0.2, 0.06); },
  error()  { this.tone('square', 180, 120, 0.12, 0.25); },
  boom()   { this.noise(0.35, 0.5); this.tone('sawtooth', 140, 40, 0.35, 0.4); },
  waveStart(){ [392, 523, 659].forEach((f, i) => this.tone('triangle', f, f, 0.15, 0.22, i * 0.12)); },
  win()    { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.25, i * 0.14)); },
  lose()   { [400, 330, 260, 180].forEach((f, i) => this.tone('sawtooth', f, f * 0.9, 0.3, 0.25, i * 0.22)); },
};
