export const WIDTH = 416;
export const HEIGHT = 228;
/** Top bar height. */
export const HUD_H = 24;
/** Road surface: the rover's wheels sit on this line. */
export const GROUND_Y = 200;

/**
 * The canvas renders at this multiple of the design size. The game scene zooms its camera by it, and the HUD scene
 * zooms by half as much, so native 16 px sprites show at half size there without being shrunk.
 */
export const RENDER_SCALE = 4;
export const HUD_SCALE = RENDER_SCALE / 2;

export const FONT = 'Silkscreen, monospace';

export const COLORS = {
  void: 0x070403,
  line: 0x3b2820,
  rust: 0xff8243,
  tech: 0x4fdcc8,
  danger: 0xff5160,
  ink: 0xf3e5d9,
  shot: 0xfff1c2,
  gold: 0xffd27a,
};

export const TEXT = {
  ink: '#f3e5d9',
  dim: '#b39587',
  rust: '#ff8243',
  tech: '#4fdcc8',
  danger: '#ff5160',
  off: '#6e5348',
  gold: '#ffd27a',
};

/** Sprite slots exported by tools/sprites.py to assets/sprites/<slot>.png. */
export const SPRITES = ['player', 'scout', 'bomber', 'diver', 'harvester', 'dozer', 'boulder', 'mine', 'beacon', 'ice'] as const;
export type SpriteKey = (typeof SPRITES)[number];
/** Picks from the concept sheet that face the wrong way and are drawn mirrored. */
export const MIRROR: ReadonlySet<SpriteKey> = new Set(['player', 'dozer']);

/** Speeds are in design pixels per second. The rover slides forward on screen as it speeds up. */
export const ROVER = {
  minSpeed: 50, cruise: 75, maxSpeed: 110, accel: 70,
  screenX: 72, slide: 0.5,
  jumpSpeed: 170, gravity: 480,
  lives: 3, invulnerableMs: 1600, respawnDelayMs: 1400,
};
export const SHOT = { forwardSpeed: 230, range: 150, cooldown: 0.24, upSpeed: 260, maxUp: 3 };
/**
 * The cannon heats up: each trigger pull adds `perShot` (0..1) and it cools at `coolPerSec`. At 1 it jams for `jamSec`
 * while the gauge drains. Holding fire jams it in about 2 s; tapping about twice a second never does.
 */
export const HEAT = { perShot: 0.22, coolPerSec: 0.45, jamSec: 1 };
/** An ice core vents the cannon and gives `secs` of overdrive: no heat, fire twice as fast, two forward shots in flight. */
export const OVERDRIVE = { secs: 3, cooldownScale: 0.5 };
/** Points for kills, jumps and pickups are multiplied by speed: braking, cruising or boosting. Bonuses aren't. */
export const MULTIPLIER = { brake: 1, cruise: 2, boost: 3, band: 8 };

/** Points: `jump` for clearing it, `kill` for shooting it. */
export const POINTS = {
  scout: 100, bomber: 200, diver: 300,
  /** A big boulder: `chip` for the first hit, which breaks it down to a boulder, then a boulder's `kill`. */
  boulder: { jump: 100, kill: 100, chip: 100 },
  roller: { jump: 100, kill: 150 },
  /** `defuse`: shooting an armed mine out of the air. */
  mine: { jump: 50, defuse: 300 },
  harvester: { jump: 100, kill: 300 },
  dozer: { jump: 100, kill: 200 },
  ice: 250,
};
export const SCORING = { sectorBonus: 1000, routeBonus: 5000, extraRoversAt: [20000, 50000, 100000] };

export const ENEMY = {
  /** Each of the three hovers around its own screen x, weaving across the rover so its pellets and your shots can meet. */
  scout: { hoverX: [150, 120, 90] as const, weave: 46, dropEvery: [1.6, 2.6] as const, life: 7 },
  bomber: { y: 52, ahead: 110, charges: 3, dropEvery: 1.9 },
  /** Glides in to hover over the rover, hangs (flashing), then plunges with this acceleration. */
  diver: { hoverY: 44, glide: 1.6, hang: 0.7, plunge: 420 },
  harvester: { speed: 18, fireEvery: 1.8, shellSpeed: 85 },
  /** Speed relative to the rover while behind it, then once it has passed. */
  dozer: { catchUp: 70, ahead: 28 },
  /** Craters a charge blasts into the road. */
  chargeCrater: 16,
  /** Big boulders are drawn at `bigScale` and hit within `reach` of the rover and below `height`; the first hit breaks one down to a boulder. */
  bigBoulder: { bigScale: 1.5, reach: 12, height: 16 },
  /**
   * A shot arms a mine: after `fuse` s it leaps (`leap` px/s up, under `gravity`) to hang over the rover, then drops on it
   * keeping pace with the rover's speed at the leap. It blows up on landing, killing a rover on the road within `blast`
   * px. Shoot it down as it drops, or brake or boost as it leaps so it lands short or long.
   */
  mine: { fuse: 0.4, leap: 260, gravity: 480, blast: 12 },
  /** Rolling boulders roll in from the right at `speed` (ground px/s), hopping up to `bounce` px, `hops` times a second. */
  roller: { speed: 40, bounce: 3, hops: 2.2 },
};

export type GroundKind = 'crater' | 'boulder' | 'bigBoulder' | 'roller' | 'mine' | 'mineField' | 'harvester' | 'dozer' | 'ice';
export type AirKind = 'scouts' | 'bomber' | 'diver';

/**
 * A stretch of road between two beacons, built as one set piece:
 * `intro` shows the sector's new hazards alone with room to read them; `breather` is sparse; `gauntlet` is dense and
 * mixed; `mineRun` is mines and mine pairs (tempting to shoot); `airRaid` is a quiet road under scripted air waves.
 * Every stretch floats an ice core over one of its hazards, so grabbing it means jumping at a risky moment.
 */
export type Stretch = 'intro' | 'breather' | 'gauntlet' | 'mineRun' | 'airRaid';

export interface Sector {
  name: string;
  /** Hazards that can appear, with relative weights. */
  ground: Partial<Record<GroundKind, number>>;
  /** What this sector adds: its intro stretch shows only these. */
  introduces: GroundKind[];
  /** One set piece per beacon. */
  stretches: Stretch[];
  air: AirKind[];
  /** Seconds between air waves. */
  airEvery: number;
  /** Shifts the far hills' colour and the volcano's size, so each sector looks different. */
  look: { far: number; volcano: number };
}

export const SECTORS: Sector[] = [
  {
    name: 'CHRYSE FLATS', ground: { crater: 4, boulder: 3 }, introduces: ['crater', 'boulder'],
    stretches: ['intro', 'breather', 'gauntlet'], air: ['scouts'], airEvery: 9, look: { far: 0, volcano: 0.3 },
  },
  {
    name: 'ARES VALLIS', ground: { crater: 3, boulder: 2, mine: 3, mineField: 1 }, introduces: ['mine'],
    stretches: ['intro', 'mineRun', 'gauntlet'], air: ['scouts', 'bomber'], airEvery: 8, look: { far: 1, volcano: 0.2 },
  },
  {
    name: 'THARSIS RISE', ground: { crater: 3, boulder: 2, bigBoulder: 2, roller: 2, mine: 2, mineField: 1 }, introduces: ['roller', 'bigBoulder'],
    stretches: ['intro', 'gauntlet', 'airRaid'], air: ['scouts', 'bomber'], airEvery: 7.5, look: { far: 2, volcano: 0.6 },
  },
  {
    name: 'NOCTIS LABYRINTH', ground: { crater: 3, boulder: 2, bigBoulder: 1, roller: 1, mine: 2, mineField: 1, harvester: 2, dozer: 2 }, introduces: ['harvester', 'dozer'],
    stretches: ['intro', 'mineRun', 'gauntlet'], air: ['scouts', 'diver', 'bomber'], airEvery: 7, look: { far: 3, volcano: 0.4 },
  },
  {
    name: 'OLYMPUS APPROACH', ground: { crater: 3, boulder: 2, bigBoulder: 2, roller: 2, mine: 2, mineField: 1, harvester: 2, dozer: 2 }, introduces: [],
    stretches: ['gauntlet', 'airRaid', 'gauntlet'], air: ['scouts', 'diver', 'bomber'], airEvery: 6, look: { far: 4, volcano: 1 },
  },
];

export const COURSE = {
  beaconsPerSector: 3,
  /** Road between two beacons. Each stretch keeps its first 200 and last 140 clear, so a respawn is always safe. */
  segmentLength: 900,
  /** Gap between hazards, [min, max], per set piece on the Day shift; Dusk laps shrink them. */
  gaps: { intro: [170, 230], breather: [200, 260], gauntlet: [95, 130], mineRun: [110, 150], airRaid: [210, 270] } as Record<Stretch, readonly [number, number]>,
  duskGapScale: 0.82,
  /** A mine pair's spacing. At cruise or brake, any jump that clears the first mine leaves room to clear the second. */
  mineFieldGap: 56,
  /** Air waves an air raid sends, spread along its stretch. */
  raidWaves: 2,
};

/** Each Dusk lap speeds the machines up by this much (1 = Day speed). */
export const DUSK_SPEEDUP = 0.25;

/** Registry key the game writes its HUD state to each frame; the HUD scene reads it. */
export const HUD_STATE = 'hudState';

/**
 * Juice (src/effects.ts). Bursts: neon sparks (count, speed in design px/s, life in ms), a shockwave ring (radius),
 * and shake in game pixels. `glow` is a soft additive halo drawn under bright things; there's no full-screen bloom.
 */
export const FX = {
  bursts: {
    small: { sparks: 18, speed: 130, life: 420, ring: 12, shake: 0.8 },
    big: { sparks: 40, speed: 180, life: 600, ring: 22, shake: 1.8 },
    huge: { sparks: 90, speed: 230, life: 850, ring: 36, shake: 3.2 },
  },
  /** Rover death: a white flash at this alpha, and a camera roll in radians. */
  deathFlash: 0.4,
  deathRoll: 0.025,
  glow: { enabled: true, alpha: 0.3 },
};

/** Debris colours per thing that blows up. */
export const DEBRIS = {
  rover: [COLORS.rust, COLORS.gold, COLORS.ink, 0x7a3a22],
  rock: [0xc87447, 0x7a3a22, 0xefaa76],
  machine: [COLORS.tech, COLORS.rust, COLORS.ink],
  air: [COLORS.tech, 0xc7fff6, COLORS.rust],
  charge: [COLORS.gold, COLORS.rust, 0x7a3a22],
  ice: [0xd8f6ff, COLORS.tech, 0xffffff],
  dust: [0xc88a62, 0xa8683f],
};
