import Phaser from 'phaser';

/**
 * A chiptune loop, written out by hand and rendered into an audio buffer when the game loads, like the sound effects.
 * `chords`: one per bar ('D', 'Bb', 'Am'). `lead`: eighth notes ('C#5'), '-' holds the last note, '.' rests, '|' is
 * just a bar line. `bass`: eight eighth notes per bar, semitones above the chord root (null rests). Drum lines are
 * 16 sixteenths per bar, 'x' for a hit. The arpeggio runs the chord's tones in sixteenths.
 */
interface Track {
  bpm: number;
  chords: string;
  lead: string;
  leadWave: 'square' | 'triangle';
  bass: Array<number | null>;
  kick: string;
  snare: string;
  hat: string;
  /** Arpeggio level; 0 leaves it out. */
  arp: number;
}

export const TRACKS = {
  /** The Day shift: driving, in D, borrowing C and Bb for a wide-open feel. */
  day: {
    bpm: 132,
    chords: 'D C G A D C Bb A  Bb C D D Bb C A A',
    lead: `
      D5 - - A4 D5 E5 F#5 - | E5 - - C5 E5 G5 E5 - | D5 - - B4 D5 - G4 - | A4 - C#5 - E5 - - - |
      D5 - - A4 D5 E5 F#5 A5 | G5 - E5 - C5 - E5 - | F5 - D5 - Bb4 - D5 F5 | E5 - - - C#5 - A4 - |
      . . F5 - - - D5 - | E5 - - - G5 - - - | F#5 - - - A5 - F#5 - | D5 - - - - - . . |
      . . F5 - G5 - F5 - | E5 - - - C5 - E5 - | A5 - - - G5 - E5 - | C#5 - - - E5 - - - |`,
    leadWave: 'square',
    bass: [0, 0, 12, 0, 7, 0, 12, 7],
    kick: 'x.......x.x.....',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.x.',
    arp: 0.03,
  },
  /** The Dusk shift: slower, in A minor, half-time drums and a thin lead. */
  dusk: {
    bpm: 108,
    chords: 'Am F G Em Am F Dm E  Am F G Em Am F Dm E',
    lead: `
      A4 - - - C5 - E5 - | F5 - - - E5 - C5 - | D5 - - - B4 - G4 - | B4 - - - - - . . |
      A4 - - - C5 - E5 - | A5 - - - G5 - F5 - | F5 - E5 - D5 - C5 - | B4 - - - G#4 - - - |
      E5 - - - - - - - | F5 - - - - - - - | G5 - - - D5 - - - | E5 - - - - - . . |
      C5 - D5 - E5 - A5 - | G5 - F5 - E5 - C5 - | D5 - - - F5 - - - | E5 - - - G#5 - - - |`,
    leadWave: 'triangle',
    bass: [0, null, 0, 12, null, 0, 7, null],
    kick: 'x.........x.....',
    snare: '........x.......',
    hat: '..x...x...x...x.',
    arp: 0.045,
  },
} satisfies Record<string, Track>;

export type TrackName = keyof typeof TRACKS;

/** How loud the music plays next to the sound effects. */
export const MUSIC_VOLUME = 0.55;

const RATE = 22050;
const cacheKey = (name: TrackName) => `music-${name}`;
const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'C#5' or 'Bb4' to a MIDI note number. */
function midi(name: string) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return 12 * (Number(m[3]) + 1) + SEMITONE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const hz = (n: number) => 440 * 2 ** ((n - 69) / 12);

/** Root (as a MIDI note in octave 2) and the chord's tones above it. */
function chord(name: string) {
  const minor = name.endsWith('m');
  return { root: midi(`${minor ? name.slice(0, -1) : name}2`), tones: [0, minor ? 3 : 4, 7, 12] };
}

type Wave = 'square' | 'triangle' | 'sine';
interface Note { at: number; len: number; freq: number; wave: Wave; volume: number; duty?: number; decay?: number; vibrato?: boolean }

/** Adds one note to the loop, wrapping past the end so the loop has no seam. */
function addNote(out: Float32Array, n: Note) {
  const length = Math.round(n.len * RATE), start = Math.round(n.at * RATE);
  const attack = 0.004 * RATE, release = Math.min(0.03 * RATE, length / 2);
  let phase = 0, filtered = 0;
  for (let i = 0; i < length; i++) {
    const t = i / RATE;
    const f = n.vibrato && t > 0.18 ? n.freq * (1 + Math.sin(2 * Math.PI * 5.5 * t) * 0.006) : n.freq;
    phase = (phase + f / RATE) % 1;
    let s: number;
    if (n.wave === 'square') s = phase < (n.duty ?? 0.5) ? 1 : -1;
    else if (n.wave === 'triangle') s = 1 - 4 * Math.abs(phase - 0.5);
    else s = Math.sin(2 * Math.PI * phase);
    filtered += (s - filtered) * 0.45;
    let env = i < attack ? i / attack : 1;
    if (i > length - release) env *= (length - i) / release;
    if (n.decay) env *= 0.35 + 0.65 * Math.exp(-t * n.decay);
    out[(start + i) % out.length] += filtered * env * n.volume;
  }
}

/** Kick (a falling sine), snare (noise with a body) and hat (bright noise). */
function addDrum(out: Float32Array, at: number, kind: 'kick' | 'snare' | 'hat') {
  const len = { kick: 0.22, snare: 0.18, hat: 0.04 }[kind] * RATE, start = Math.round(at * RATE);
  let phase = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    let s: number;
    if (kind === 'kick') {
      phase += (45 + 120 * Math.exp(-t * 32)) / RATE;
      s = Math.sin(2 * Math.PI * phase) * Math.exp(-t * 16) * 0.5;
    } else if (kind === 'snare') {
      phase += 185 / RATE;
      s = ((Math.random() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * phase) * 0.4 * Math.exp(-t * 30)) * Math.exp(-t * 20) * 0.22;
    } else {
      const noise = Math.random() * 2 - 1;
      s = (noise - last) * 0.5 * Math.exp(-t * 70) * 0.09; // the difference of white noise leans bright
      last = noise;
    }
    out[(start + i) % out.length] += s;
  }
}

function render(ctx: BaseAudioContext, track: Track): AudioBuffer {
  const chords = track.chords.trim().split(/\s+/).map(chord);
  const lead = track.lead.split(/\s+/).filter((tok) => tok && tok !== '|');
  const steps = chords.length * 16;
  const step = 60 / track.bpm / 4;
  const buffer = ctx.createBuffer(1, Math.round(steps * step * RATE), RATE);
  const out = buffer.getChannelData(0);

  chords.forEach(({ root, tones }, bar) => {
    const at = (s: number) => (bar * 16 + s) * step;
    track.bass.forEach((off, i) => {
      if (off !== null) addNote(out, { at: at(i * 2), len: step * 1.8, freq: hz(root + off), wave: 'triangle', volume: 0.24 });
    });
    if (track.arp) {
      for (let i = 0; i < 16; i++) {
        addNote(out, { at: at(i), len: step * 0.9, freq: hz(root + 24 + tones[i % 4]), wave: 'square', duty: 0.25, volume: track.arp, decay: 18 });
      }
    }
    for (let i = 0; i < 16; i++) {
      if (track.kick[i] === 'x') addDrum(out, at(i), 'kick');
      if (track.snare[i] === 'x') addDrum(out, at(i), 'snare');
      if (track.hat[i] === 'x') addDrum(out, at(i), 'hat');
    }
  });

  // The lead: each note runs until the next note or rest.
  for (let i = 0; i < lead.length; i++) {
    if (lead[i] === '-' || lead[i] === '.') continue;
    let held = 1;
    while (i + held < lead.length && lead[i + held] === '-') held++;
    const wave = track.leadWave;
    addNote(out, {
      at: i * 2 * step, len: held * 2 * step * 0.92, freq: hz(midi(lead[i])), wave, duty: 0.5,
      volume: wave === 'square' ? 0.085 : 0.16, decay: 3, vibrato: true,
    });
  }

  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0.95) for (let i = 0; i < out.length; i++) out[i] *= 0.95 / peak;
  return buffer;
}

/** Renders every track into Phaser's audio cache. Without Web Audio (or in attract mode) there's no music. */
export function registerMusic(scene: Phaser.Scene) {
  if (!(scene.sound instanceof Phaser.Sound.WebAudioSoundManager)) return;
  for (const [name, track] of Object.entries(TRACKS) as Array<[TrackName, Track]>) {
    if (!scene.cache.audio.exists(cacheKey(name))) scene.cache.audio.add(cacheKey(name), render(scene.sound.context, track));
  }
}

/** The patrol's music: one looping track at a time, gone when the scene shuts down. The mute setting covers it. */
export class Music {
  private sound: Phaser.Sound.WebAudioSound | undefined;
  private name: TrackName | undefined;

  constructor(private readonly scene: Phaser.Scene) {
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stop());
  }

  /** Starts a track from the top, unless it's already the one playing. */
  play(name: TrackName) {
    if (this.name === name && this.sound) return;
    this.stop();
    if (!this.scene.cache.audio.exists(cacheKey(name))) return;
    this.name = name;
    this.sound = this.scene.sound.add(cacheKey(name), { loop: true, volume: MUSIC_VOLUME }) as Phaser.Sound.WebAudioSound;
    this.sound.play();
  }

  stop() {
    if (this.sound) this.scene.tweens.killTweensOf(this.sound);
    this.sound?.destroy();
    this.sound = undefined;
    this.name = undefined;
  }

  pause(on: boolean) {
    if (on) this.sound?.pause();
    else this.sound?.resume();
  }

  /** Dips the music under a jingle for `ms`, then brings it back. */
  duck(ms: number) {
    const s = this.sound;
    if (!s) return;
    this.scene.tweens.killTweensOf(s);
    s.setVolume(MUSIC_VOLUME * 0.2);
    this.scene.tweens.add({ targets: s, volume: MUSIC_VOLUME, delay: ms, duration: 700 });
  }
}
