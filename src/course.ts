import { COURSE, SECTORS, type GroundKind } from './config';

export type ItemKind = Exclude<GroundKind, 'mineField'> | 'beacon';

/** One thing on the road, at world x. A dozer's x is where it overtakes the rover. */
export interface CourseItem {
  kind: ItemKind;
  x: number;
  /** Crater width. */
  w?: number;
}

export interface SectorCourse {
  index: number;
  lap: number;
  startX: number;
  endX: number;
  /** World x of each beacon; the last one ends the sector. */
  beacons: number[];
  /** Sorted by x. */
  items: CourseItem[];
  /** Seconds. */
  par: number;
}

/** Small seeded generator (mulberry32), so a sector is laid out the same way every time you retry it. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted<T extends string>(weights: Partial<Record<T, number>>, r: number): T {
  const entries = Object.entries(weights) as Array<[T, number]>;
  let total = entries.reduce((sum, [, w]) => sum + w, 0) * r;
  for (const [kind, w] of entries) if ((total -= w) < 0) return kind;
  return entries[entries.length - 1][0];
}

/** How much road a hazard takes up, so the next one isn't placed on top of it. */
const LENGTH: Record<GroundKind, number> = { crater: 34, boulder: 16, bigBoulder: 16, mine: 16, mineField: COURSE.mineFieldGap + 16, harvester: 16, dozer: 0, ice: 0 };

/**
 * Lays out one sector: five stretches of road, each ending at a beacon. Each stretch starts and ends with clear road,
 * so a respawn at a beacon is always safe, and hazards are spaced so every one can be jumped or shot.
 */
export function generateSector(index: number, lap: number, startX: number): SectorCourse {
  const sector = SECTORS[index];
  const rand = rng(index * 7919 + lap * 104729 + 1);
  const scale = lap > 0 ? COURSE.duskGapScale : 1;
  const items: CourseItem[] = [];
  const beacons: number[] = [];
  let segStart = startX;
  for (let b = 0; b < COURSE.beaconsPerSector; b++) {
    const segEnd = segStart + COURSE.segmentLength;
    let x = segStart + 200;
    while (x < segEnd - 140) {
      const kind = weighted(sector.ground, rand());
      if (kind === 'crater') items.push({ kind, x, w: 20 + Math.floor(rand() * 15) });
      else if (kind === 'mineField') items.push({ kind: 'mine', x }, { kind: 'mine', x: x + COURSE.mineFieldGap });
      else items.push({ kind, x });
      const [lo, hi] = COURSE.gap;
      x += LENGTH[kind] + (lo + rand() * (hi - lo)) * scale;
    }
    items.push({ kind: 'beacon', x: segEnd });
    beacons.push(segEnd);
    segStart = segEnd;
  }
  items.sort((a, b) => a.x - b.x);
  const endX = segStart;
  return { index, lap, startX, endX, beacons, items, par: Math.round((endX - startX) / COURSE.parSpeed) };
}
