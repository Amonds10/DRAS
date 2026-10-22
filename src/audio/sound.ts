import { storage } from '../ui/dom';

/**
 * 소리: Kenney(CC0) 효과음 샘플 + Web Audio로 합성한 마법 효과음 + 장면별로 생성되는 배경 음악.
 *
 * 마법 소리는 종소리(FM 합성)를 바탕으로 한다. 성속마다 음 높이가 정해져 있어서
 * 링크가 이어지면 음이 차례로 올라가고, 예열은 중첩마다 반음씩 높아지며 차오른다.
 * 배경 음악은 화음 진행 위에 패드·베이스·종소리 아르페지오(전투에서는 북)를 실시간으로 엮는다.
 */

export type Mood = 'title' | 'map' | 'dawn' | 'neon' | 'dune' | 'snow' | 'sky' | 'boss' | 'quiet';
export type AudioPref = 'on' | 'sfx' | 'off';
export type SampleName =
  | 'ui_click' | 'ui_hover' | 'ui_toggle' | 'card_place' | 'card_slide' | 'card_fan' | 'card_remove'
  | 'page_flip' | 'book_open' | 'cloth' | 'cloth2' | 'draw_blade' | 'slice' | 'metal' | 'step' | 'coins';

const SAMPLES: SampleName[] = ['ui_click', 'ui_hover', 'ui_toggle', 'card_place', 'card_slide', 'card_fan', 'card_remove', 'page_flip', 'book_open', 'cloth', 'cloth2', 'draw_blade', 'slice', 'metal', 'step', 'coins'];
const PREF_KEY = 'starweaver.audio';

/** 성속별 음(반음, C 기준) */
const EL_NOTE: Record<string, number> = { sol: 0, luna: 4, nebula: 7, comet: 9, void: 2, star: 12 };

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Song {
  bpm: number;
  /** 으뜸음(MIDI) */
  root: number;
  scale: number[];
  /** 마디마다 바뀌는 화음(음계 도수) */
  prog: number[];
  /** 아르페지오 밀도 0..1 */
  arp: number;
  /** 16분음표 아르페지오 */
  fast?: boolean;
  drums: 0 | 1 | 2;
  pad: number;
  /** 종소리 음색(변조 비율) */
  bell: number;
}

const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const MIXO = [0, 2, 4, 5, 7, 9, 10];

const SONGS: Record<Mood, Song> = {
  title: { bpm: 64, root: 50, scale: LYDIAN, prog: [0, 4, 5, 3], arp: 0.45, drums: 0, pad: 1, bell: 3.5 },
  map: { bpm: 70, root: 52, scale: DORIAN, prog: [0, 3, 6, 4], arp: 0.4, drums: 0, pad: 0.9, bell: 2 },
  dawn: { bpm: 88, root: 50, scale: DORIAN, prog: [0, 5, 3, 4], arp: 0.5, drums: 1, pad: 0.8, bell: 3.5 },
  neon: { bpm: 96, root: 45, scale: AEOLIAN, prog: [0, 5, 2, 6], arp: 0.55, fast: true, drums: 2, pad: 0.7, bell: 1.5 },
  dune: { bpm: 90, root: 52, scale: PHRYGIAN, prog: [0, 1, 0, 6], arp: 0.45, drums: 1, pad: 0.8, bell: 2.5 },
  snow: { bpm: 76, root: 54, scale: AEOLIAN, prog: [0, 5, 3, 6], arp: 0.5, drums: 1, pad: 1, bell: 4 },
  sky: { bpm: 84, root: 49, scale: MIXO, prog: [0, 6, 3, 4], arp: 0.5, drums: 1, pad: 0.9, bell: 3 },
  boss: { bpm: 104, root: 40, scale: PHRYGIAN, prog: [0, 1, 5, 1], arp: 0.6, fast: true, drums: 2, pad: 0.8, bell: 1.41 },
  quiet: { bpm: 60, root: 50, scale: AEOLIAN, prog: [0, 5], arp: 0.15, drums: 0, pad: 0.6, bell: 3.5 },
};

class SoundSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private verb!: ConvolverNode;
  private verbSend!: GainNode;
  private echo!: DelayNode;
  private echoSend!: GainNode;
  private noise!: AudioBuffer;
  private buffers = new Map<SampleName, AudioBuffer>();
  private pref: AudioPref;
  private mood: Mood = 'title';
  private song: Song = SONGS.title;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private lastHover = 0;

  constructor() {
    const p = storage.getItem(PREF_KEY);
    this.pref = p === 'sfx' || p === 'off' ? p : 'on';
  }

  get preference(): AudioPref {
    return this.pref;
  }

  label(): string {
    return { on: '음악·효과음', sfx: '효과음만', off: '끔' }[this.pref];
  }

  /** 켬 → 효과음만 → 끔 */
  cycle(): string {
    this.pref = this.pref === 'on' ? 'sfx' : this.pref === 'sfx' ? 'off' : 'on';
    storage.setItem(PREF_KEY, this.pref);
    this.applyLevels();
    if (this.pref !== 'off') this.ui('ui_toggle');
    return this.label();
  }

  /** 브라우저는 사용자 입력 뒤에만 소리를 낼 수 있다. 첫 클릭·키 입력에서 부른다. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    // 공간감: 생성한 잔향(소음이 지수로 사라지는 임펄스)
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(2.8, 2.4);
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0.9;
    this.verbSend.connect(this.verb).connect(this.master);
    // 메아리: 종소리 아르페지오에 걸어 별빛이 번지는 느낌
    this.echo = ctx.createDelay(2);
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    this.echoSend = ctx.createGain();
    this.echoSend.gain.value = 0.5;
    this.echoSend.connect(this.echo);
    this.echo.connect(tone).connect(fb).connect(this.echo);
    tone.connect(this.verbSend);
    tone.connect(this.musicBus);
    this.noise = this.makeNoise();
    this.applyLevels();
    void this.loadSamples();
    this.setSong(this.mood, true);
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  private applyLevels(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.pref === 'off' ? 0 : 0.9, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.pref === 'on' ? 0.42 : 0, t, 0.3);
    this.sfxBus.gain.setTargetAtTime(0.8, t, 0.05);
  }

  private async loadSamples(): Promise<void> {
    const ctx = this.ctx!;
    await Promise.all(
      SAMPLES.map(async (name) => {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}sfx/${name}.ogg`);
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(name, buf);
        } catch {
          // 이 브라우저가 ogg를 못 풀면 그 소리만 빠진다
        }
      }),
    );
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private get ok(): boolean {
    return !!this.ctx && this.pref !== 'off' && this.ctx.state === 'running';
  }

  // ── 합성 재료 ──────────────────────────────────────────

  /** 종소리: 사인파를 사인파로 변조. ratio가 음색, 변조 깊이는 빨리 줄어든다. */
  private bell(midi: number, t: number, vol: number, decay = 1.6, ratio = 3.5, out?: AudioNode, wet = 0.5): void {
    const ctx = this.ctx!;
    const f = mtof(midi);
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const amp = ctx.createGain();
    car.frequency.value = f;
    mod.frequency.value = f * ratio;
    modGain.gain.setValueAtTime(f * 2.2, t);
    modGain.gain.exponentialRampToValueAtTime(f * 0.05, t + decay * 0.6);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    mod.connect(modGain).connect(car.frequency);
    car.connect(amp);
    amp.connect(out ?? this.sfxBus);
    const send = ctx.createGain();
    send.gain.value = wet;
    amp.connect(send).connect(this.verbSend);
    car.start(t);
    mod.start(t);
    car.stop(t + decay + 0.05);
    mod.stop(t + decay + 0.05);
  }

  /** 걸러 낸 소음(바람·쉭·폭발) */
  private hiss(t: number, dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, q = 1, wet = 0.3, attack = 0.005): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vol, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(amp).connect(this.sfxBus);
    const send = ctx.createGain();
    send.gain.value = wet;
    amp.connect(send).connect(this.verbSend);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  /** 낮게 떨어지는 쿵 소리 */
  private thump(t: number, vol: number, f0 = 140, f1 = 42, dur = 0.35, out?: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** 높이가 미끄러지는 음(차오름·하강) */
  private sweep(t: number, dur: number, vol: number, f0: number, f1: number, type: OscillatorType = 'triangle', cutoff = 2400, wet = 0.4): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(filt).connect(g).connect(this.sfxBus);
    const send = ctx.createGain();
    send.gain.value = wet;
    g.connect(send).connect(this.verbSend);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private play(name: SampleName, vol = 0.6, rate = 1, delay = 0): void {
    const buf = this.buffers.get(name);
    if (!buf || !this.ok) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.sfxBus);
    src.start(ctx.currentTime + delay);
  }

  private now(): number {
    return this.ctx!.currentTime + 0.01;
  }

  // ── 효과음 ────────────────────────────────────────────

  ui(name: SampleName, vol = 0.5): void {
    if (name === 'ui_hover') {
      const n = performance.now();
      if (n - this.lastHover < 70) return;
      this.lastHover = n;
      vol = 0.18;
    }
    this.play(name, vol);
  }

  /** 시전: 성속 음의 종소리 + 동작 소리(옷깃, 칼집) */
  cast(element: string, chain: number, motion: string): void {
    if (!this.ok) return;
    const t = this.now();
    const base = 72 + (EL_NOTE[element] ?? 0);
    // 링크가 길수록 같은 음을 한 옥타브 높게 겹친다
    this.bell(base, t, 0.18, 1.8, 3.5);
    if (chain >= 2) this.bell(base + 12, t + 0.06, 0.1, 1.4, 2);
    this.hiss(t, 0.35, 0.12, 'bandpass', 600, 4000, 1.4, 0.2, 0.12);
    this.play(motion === 'slash' ? 'draw_blade' : Math.random() < 0.5 ? 'cloth' : 'cloth2', 0.45);
  }

  /** 링크: 체인 단계마다 오음음계로 한 칸씩 올라가는 화음 */
  link(chain: number, element: string): void {
    if (!this.ok) return;
    const t = this.now();
    const penta = [0, 2, 4, 7, 9, 12, 14, 16];
    const n = 79 + (EL_NOTE[element] ?? 0) % 12 + penta[Math.min(chain, penta.length - 1)];
    this.bell(n, t, 0.12, 1.2, 2);
    this.bell(n + 7, t + 0.05, 0.07, 1.0, 2);
  }

  /** 투사체·광선이 날아가는 쉭 소리 */
  whoosh(kind: 'projectile' | 'beam' | 'sweep' | 'mark'): void {
    if (!this.ok) return;
    const t = this.now();
    if (kind === 'beam') {
      this.sweep(t, 0.4, 0.12, 300, 1800, 'sawtooth', 3000);
      this.hiss(t, 0.45, 0.2, 'highpass', 2000, 6000, 0.7, 0.4);
    } else if (kind === 'sweep') this.hiss(t, 0.5, 0.3, 'bandpass', 3000, 400, 0.8, 0.4, 0.15);
    else if (kind === 'mark') this.bell(96, t, 0.06, 0.5, 5);
    else this.hiss(t, 0.28, 0.18, 'bandpass', 800, 5000, 2, 0.25, 0.1);
  }

  hit(kind: 'ally' | 'enemy' | 'burn' | 'doom' | 'chain' | 'counter' | 'crit' | 'slash' | 'blocked'): void {
    if (!this.ok) return;
    const t = this.now();
    switch (kind) {
      case 'enemy':
        this.thump(t, 0.5, 110, 40, 0.3);
        this.hiss(t, 0.25, 0.3, 'lowpass', 2400, 300, 0.7, 0.2);
        this.play('slice', 0.35, 0.8);
        break;
      case 'burn':
        this.hiss(t, 0.5, 0.22, 'bandpass', 900, 2500, 0.6, 0.2, 0.05);
        break;
      case 'doom':
        this.thump(t, 0.9, 160, 30, 0.8);
        this.hiss(t, 1.0, 0.45, 'lowpass', 4000, 120, 0.5, 0.6);
        break;
      case 'chain':
        this.bell(84, t, 0.12, 1.2, 1.41);
        this.thump(t, 0.4, 180, 60, 0.25);
        break;
      case 'counter':
      case 'slash':
        this.play('slice', 0.55);
        this.hiss(t, 0.18, 0.22, 'highpass', 3000, 8000, 0.7, 0.2);
        break;
      case 'crit':
        this.thump(t, 1, 180, 28, 0.9);
        this.hiss(t, 1.2, 0.5, 'lowpass', 6000, 100, 0.4, 0.8);
        this.bell(60, t, 0.25, 2.5, 1.41);
        this.bell(67, t + 0.02, 0.18, 2.5, 1.41);
        break;
      case 'blocked':
        this.play('metal', 0.5);
        this.bell(88, t, 0.08, 0.6, 1.41);
        break;
      default:
        this.thump(t, 0.45, 150, 55, 0.22);
        this.hiss(t, 0.16, 0.22, 'lowpass', 5000, 600, 0.7, 0.2);
    }
  }

  heal(): void {
    if (!this.ok) return;
    const t = this.now();
    [76, 79, 83, 88].forEach((n, i) => this.bell(n, t + i * 0.07, 0.08, 1.3, 1));
  }

  shield(): void {
    if (!this.ok) return;
    const t = this.now();
    this.bell(69, t, 0.14, 1.6, 1.41);
    this.bell(76, t + 0.03, 0.08, 1.4, 1.41);
    this.play('metal', 0.3, 1.2);
  }

  debuff(): void {
    if (!this.ok) return;
    const t = this.now();
    this.sweep(t, 0.45, 0.09, 600, 180, 'sawtooth', 1400);
  }

  /** 예열: 중첩 수만큼 높아지는 상승음과 불티 소리. 가득 차면 화음이 한 겹 더 열린다. */
  kindle(stacks: number, max: number): void {
    if (!this.ok) return;
    const t = this.now();
    const top = 55 + stacks * 3;
    this.sweep(t, 0.55, 0.14, mtof(top - 12), mtof(top), 'sawtooth', 900 + stacks * 400, 0.5);
    this.hiss(t, 0.6, 0.16, 'bandpass', 1500, 5000, 3, 0.3, 0.3);
    this.bell(top + 12, t + 0.42, 0.11, 1.2, 2);
    if (stacks >= 3) this.bell(top + 19, t + 0.48, 0.08, 1.2, 2);
    if (stacks >= max) this.bell(top + 24, t + 0.54, 0.1, 1.8, 3.5);
  }

  /** 극딜 해방: 숨을 들이켜듯 소음이 차오른 뒤 낮은 충격과 큰 화음 */
  unleash(stacks: number): void {
    if (!this.ok) return;
    const t = this.now();
    this.hiss(t, 0.7, 0.35, 'bandpass', 300, 6000, 1.2, 0.5, 0.65);
    this.sweep(t, 0.7, 0.14, 80, 80 * Math.pow(2, 1 + stacks / 6), 'sawtooth', 2400, 0.6);
    const hitT = t + 0.72;
    this.thump(hitT, 1, 120, 25, 1.1);
    [48, 55, 60, 64, 67].forEach((n, i) => this.bell(n + 12, hitT + i * 0.015, 0.1, 3, 1.41));
  }

  reaction(from: string, to: string): void {
    if (!this.ok) return;
    const t = this.now();
    const a = 72 + (EL_NOTE[from] ?? 0);
    const b = 72 + (EL_NOTE[to] ?? 0);
    this.hiss(t, 0.4, 0.2, 'bandpass', 500, 7000, 1.5, 0.5, 0.35);
    this.bell(a, t + 0.3, 0.16, 2.2, 3.5);
    this.bell(b, t + 0.36, 0.16, 2.2, 3.5);
    this.bell(b + 12, t + 0.42, 0.1, 2.4, 2);
    this.thump(t + 0.3, 0.5, 200, 60, 0.35);
  }

  /** 성좌 완성: 네 음이 차례로 올라가 하나의 별자리가 된다 */
  fullChain(): void {
    if (!this.ok) return;
    const t = this.now();
    [72, 76, 79, 84, 88, 91].forEach((n, i) => this.bell(n, t + i * 0.08, 0.13, 2.6, i % 2 ? 2 : 3.5));
    this.hiss(t + 0.45, 1.6, 0.18, 'highpass', 5000, 9000, 0.5, 0.8, 0.05);
    this.thump(t + 0.45, 0.8, 120, 35, 0.9);
  }

  attune(element: string): void {
    if (!this.ok) return;
    this.bell(96 + (EL_NOTE[element] ?? 0), this.now(), 0.04, 0.6, 5);
  }

  release(element: string): void {
    if (!this.ok) return;
    const t = this.now();
    const n = 60 + (EL_NOTE[element] ?? 0);
    [0, 7, 12, 16, 19, 24].forEach((d, i) => this.bell(n + d, t + i * 0.035, 0.1, 2.4, 3.5));
    this.thump(t, 0.6, 140, 40, 0.6);
  }

  stardust(): void {
    if (!this.ok) return;
    const t = this.now();
    this.bell(100, t, 0.05, 0.5, 4);
    this.bell(103, t + 0.05, 0.04, 0.5, 4);
  }

  enemyAct(): void {
    if (!this.ok) return;
    const t = this.now();
    this.sweep(t, 0.4, 0.14, 70, 140, 'sawtooth', 500, 0.3);
    this.hiss(t, 0.3, 0.15, 'lowpass', 600, 2000, 1, 0.2, 0.2);
  }

  death(enemy: boolean): void {
    if (!this.ok) return;
    const t = this.now();
    if (enemy) {
      this.sweep(t, 0.9, 0.16, 400, 60, 'sawtooth', 1200, 0.6);
      this.hiss(t, 1.0, 0.3, 'bandpass', 3000, 200, 0.8, 0.6, 0.02);
      this.bell(91, t + 0.1, 0.06, 1.6, 5);
    } else {
      this.sweep(t, 1.2, 0.12, 330, 110, 'triangle', 900, 0.7);
    }
  }

  seal(): void {
    if (!this.ok) return;
    const t = this.now();
    this.thump(t, 0.7, 90, 30, 1);
    this.bell(49, t, 0.12, 2.5, 1.07);
    this.bell(55, t + 0.02, 0.1, 2.5, 1.07);
  }

  victory(): void {
    if (!this.ok) return;
    const t = this.now();
    this.duck(3);
    [67, 72, 76, 79].forEach((n, i) => this.bell(n, t + i * 0.12, 0.14, 2, 3.5));
    [72, 76, 79, 84].forEach((n) => this.bell(n, t + 0.55, 0.11, 3.2, 2));
    this.play('coins', 0.4, 1, 0.6);
  }

  defeat(): void {
    if (!this.ok) return;
    const t = this.now();
    this.duck(3);
    [69, 65, 62, 57].forEach((n, i) => this.bell(n, t + i * 0.22, 0.12, 2.4, 1.41));
  }

  /** 큰 연출 동안 음악을 잠깐 낮춘다 */
  duck(seconds: number): void {
    if (!this.ctx || this.pref !== 'on') return;
    const t = this.ctx.currentTime;
    const g = this.musicBus.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0.12, t, 0.05);
    g.setTargetAtTime(0.42, t + seconds, 0.6);
  }

  // ── 배경 음악 ──────────────────────────────────────────

  setMood(mood: Mood): void {
    if (mood === this.mood && this.ctx) return;
    this.mood = mood;
    if (this.ctx) this.setSong(mood, false);
  }

  private setSong(mood: Mood, immediate: boolean): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const apply = () => {
      this.song = SONGS[mood];
      this.step = 0;
      this.nextTime = ctx.currentTime + 0.1;
    };
    if (immediate || this.pref !== 'on') {
      apply();
      return;
    }
    // 잠깐 줄였다가 새 곡으로 넘어간다
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setTargetAtTime(0, t, 0.25);
    window.setTimeout(() => {
      apply();
      this.applyLevels();
    }, 900);
  }

  private chordNotes(degree: number): number[] {
    const s = this.song.scale;
    return [0, 2, 4].map((k) => {
      const d = degree + k;
      return this.song.root + s[d % 7] + 12 * Math.floor(d / 7);
    });
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.05;
    const sixteenth = 60 / this.song.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.25) {
      if (this.pref === 'on') this.playStep(this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step++;
    }
  }

  private playStep(step: number, t: number, sixteenth: number): void {
    const s = this.song;
    const bar = Math.floor(step / 16);
    const inBar = step % 16;
    // 화음은 두 마디마다 바뀐다
    const degree = s.prog[Math.floor(bar / 2) % s.prog.length];
    const chord = this.chordNotes(degree);
    const barLen = sixteenth * 16;
    if (inBar === 0 && bar % 2 === 0) this.pad(chord, t, barLen * 2);
    if (inBar === 0) this.bass(chord[0] - 12, t, barLen);
    if (s.drums && inBar === 8 && s.drums > 1) this.bass(chord[0] - 12, t, barLen / 2, 0.5);
    // 종소리 아르페지오
    const grid = s.fast ? 1 : 2;
    if (inBar % grid === 0 && Math.random() < s.arp * (inBar % 4 === 0 ? 1.3 : 0.8)) {
      const pool = [...chord.map((n) => n + 12), ...chord.map((n) => n + 24)];
      const n = pool[Math.floor(Math.random() * pool.length)];
      this.bell(n, t, 0.05 + Math.random() * 0.03, 1.4 + Math.random(), s.bell, Math.random() < 0.3 ? this.echoSend : this.musicBus, 0.6);
    }
    // 반짝임: 아주 가끔 높은 별 소리
    if (inBar === 14 && Math.random() < 0.25) this.bell(chord[2] + 36, t, 0.025, 2, 5, this.echoSend, 0.8);
    // 북
    if (s.drums) {
      if (inBar === 0 || (s.drums > 1 && inBar === 10)) this.thump(t, 0.32, 110, 42, 0.32, this.musicBus);
      if (inBar === 8) this.snare(t, s.drums > 1 ? 0.12 : 0.06);
      if (inBar % 2 === 0) this.hat(t, inBar % 4 === 2 ? 0.05 : 0.025);
    }
  }

  private pad(chord: number[], t: number, dur: number): void {
    const ctx = this.ctx!;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(500, t);
    filt.frequency.linearRampToValueAtTime(1100, t + dur * 0.5);
    filt.frequency.linearRampToValueAtTime(600, t + dur);
    const amp = ctx.createGain();
    const vol = 0.05 * this.song.pad;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(vol, t + 1.2);
    amp.gain.setValueAtTime(vol, t + dur - 0.4);
    amp.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2);
    filt.connect(amp);
    amp.connect(this.musicBus);
    const send = ctx.createGain();
    send.gain.value = 0.6;
    amp.connect(send).connect(this.verbSend);
    for (const n of chord) {
      for (const [type, det] of [['sawtooth', -7], ['triangle', 6]] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = mtof(n);
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = type === 'sawtooth' ? 0.35 : 0.6;
        o.connect(g).connect(filt);
        o.start(t);
        o.stop(t + dur + 1.3);
      }
    }
  }

  private bass(n: number, t: number, dur: number, vol = 1): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = mtof(n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.95);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur);
  }

  private snare(t: number, vol: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(f).connect(g).connect(this.musicBus);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    g.connect(send).connect(this.verbSend);
    src.start(t, Math.random());
    src.stop(t + 0.2);
  }

  private hat(t: number, vol: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f).connect(g).connect(this.musicBus);
    src.start(t, Math.random());
    src.stop(t + 0.06);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

export const sound = new SoundSystem();

/** 첫 입력에서 오디오를 깨우고, 버튼 누름에 공통 클릭음을 붙인다. */
export function installSound(): void {
  const wake = () => sound.unlock();
  document.addEventListener('pointerdown', wake, { capture: true });
  document.addEventListener('keydown', wake, { capture: true });
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('button, [role="button"], a');
      if (!el || el.matches(':disabled') || el.dataset.sfx === 'none') return;
      // 카드처럼 따로 소리를 내는 것은 data-sfx로 빠진다
      sound.ui('ui_click', 0.35);
    },
    { capture: true },
  );
}
