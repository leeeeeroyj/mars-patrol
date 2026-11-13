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

/** Points: `jump` for clearing it, `kill` for shooting it. */
export const POINTS = {
  scout: 100, bomber: 200, diver: 300,
  boulder: { jump: 100, kill: 100, bigKill: 200 },
  mine: { jump: 50 },
  harvester: { jump: 100, kill: 300 },
  dozer: { jump: 100, kill: 200 },
  ice: 250,
};
export const SCORING = { sectorBonus: 1000, perSecondUnderPar: 100, routeBonus: 5000, extraRoversAt: [10000, 30000, 60000] };

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
};

export type GroundKind = 'crater' | 'boulder' | 'bigBoulder' | 'mine' | 'mineField' | 'harvester' | 'dozer' | 'ice';
export type AirKind = 'scouts' | 'bomber' | 'diver';

export interface Sector {
  name: string;
  /** Hazards that can appear, with relative weights. */
  ground: Partial<Record<GroundKind, number>>;
  air: AirKind[];
  /** Seconds between air waves. */
  airEvery: number;
  /** Shifts the far hills' colour and the volcano's size, so each sector looks different. */
  look: { far: number; volcano: number };
}

export const SECTORS: Sector[] = [
  { name: 'CHRYSE FLATS', ground: { crater: 4, boulder: 3, ice: 1 }, air: ['scouts'], airEvery: 9, look: { far: 0, volcano: 0.3 } },
  { name: 'ARES VALLIS', ground: { crater: 4, boulder: 3, harvester: 2, ice: 1 }, air: ['scouts', 'bomber'], airEvery: 8, look: { far: 1, volcano: 0.2 } },
  { name: 'THARSIS RISE', ground: { crater: 3, boulder: 2, bigBoulder: 2, mine: 2, mineField: 1, harvester: 1, ice: 1 }, air: ['scouts', 'bomber'], airEvery: 7.5, look: { far: 2, volcano: 0.6 } },
  { name: 'NOCTIS LABYRINTH', ground: { crater: 3, boulder: 2, bigBoulder: 1, mine: 2, harvester: 2, dozer: 2, ice: 1 }, air: ['scouts', 'diver', 'bomber'], airEvery: 7, look: { far: 3, volcano: 0.4 } },
  { name: 'OLYMPUS APPROACH', ground: { crater: 3, boulder: 2, bigBoulder: 2, mine: 2, mineField: 1, harvester: 2, dozer: 2, ice: 1 }, air: ['scouts', 'diver', 'bomber'], airEvery: 6, look: { far: 4, volcano: 1 } },
];

export const COURSE = {
  beaconsPerSector: 5,
  /** Road between two beacons. */
  segmentLength: 1100,
  /** Gap between hazards: [min, max] on the Day shift; Dusk laps shrink it. */
  gap: [120, 175] as const,
  duskGapScale: 0.82,
  /** A mine pair's spacing. At cruise or brake, any jump that clears the first mine leaves room to clear the second. */
  mineFieldGap: 56,
  /** Par is the time to drive a sector at this speed. */
  parSpeed: 88,
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
