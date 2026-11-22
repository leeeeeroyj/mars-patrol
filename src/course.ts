import { COURSE, SECTORS, type AirKind, type GroundKind, type Sector, type Stretch } from './config';

export type ItemKind = Exclude<GroundKind, 'mineField'> | 'beacon' | 'wave';

/** One thing on the road, at world x. A dozer's x is where it overtakes the rover; a roller's, where it meets the rover. */
export interface CourseItem {
  kind: ItemKind;
  x: number;
  /** Crater width. */
  w?: number;
  /** An air raid's wave, sent when the rover reaches x. */
  air?: AirKind;
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
const LENGTH: Record<GroundKind, number> = { crater: 34, boulder: 16, bigBoulder: 24, roller: 16, mine: 16, mineField: COURSE.mineFieldGap + 16, harvester: 16, dozer: 0, ice: 0 };

/** Keeps only `kinds` from a sector's weights, or all of them if none of those appear in the sector. */
function only(weights: Sector['ground'], kinds: GroundKind[]): Sector['ground'] {
  const kept = Object.fromEntries(Object.entries(weights).filter(([k]) => kinds.includes(k as GroundKind)));
  return Object.keys(kept).length ? kept : weights;
}

/** The next hazard for a set piece. An intro takes the sector's new hazards in turn. */
function pick(stretch: Stretch, sector: Sector, n: number, r: number): GroundKind {
  switch (stretch) {
    case 'intro': return sector.introduces.length ? sector.introduces[n % sector.introduces.length] : weighted(sector.ground, r);
    case 'breather':
    case 'airRaid': return weighted(only(sector.ground, ['crater', 'boulder']), r);
    case 'mineRun': return weighted(only(sector.ground, ['mine', 'mineField', 'crater']), r);
    case 'gauntlet': return weighted(sector.ground, r);
  }
}

/** Ice cores float where you jump: over craters, rocks and mines (a pair's middle), and where a dozer overtakes. */
const HOSTS: GroundKind[] = ['crater', 'boulder', 'bigBoulder', 'roller', 'mine', 'mineField', 'dozer'];

/**
 * Lays out one sector: one set piece per beacon (see `Stretch`). Each stretch starts and ends with clear road, so a
 * respawn at a beacon is always safe, hazards are spaced so every one can be jumped or shot, and an ice core floats
 * over one of its hazards: the second in an intro, a mine pair's middle in a mine run, the last in a gauntlet.
 */
export function generateSector(index: number, lap: number, startX: number): SectorCourse {
  const sector = SECTORS[index];
  const rand = rng(index * 7919 + lap * 104729 + 1);
  const scale = lap > 0 ? COURSE.duskGapScale : 1;
  const items: CourseItem[] = [];
  const beacons: number[] = [];
  let segStart = startX;
  sector.stretches.forEach((stretch) => {
    const segEnd = segStart + COURSE.segmentLength, first = segStart + 200, last = segEnd - 140;
    const hosts: Array<{ x: number; pair: boolean }> = [];
    let x = first;
    for (let n = 0; x < last; n++) {
      const kind = pick(stretch, sector, n, rand());
      if (kind === 'crater') {
        const w = 20 + Math.floor(rand() * 15);
        items.push({ kind, x, w });
        hosts.push({ x: x + w / 2, pair: false });
      } else if (kind === 'mineField') {
        items.push({ kind: 'mine', x }, { kind: 'mine', x: x + COURSE.mineFieldGap });
        hosts.push({ x: x + COURSE.mineFieldGap / 2, pair: true });
      } else {
        items.push({ kind, x });
        if (HOSTS.includes(kind)) hosts.push({ x, pair: false });
      }
      const [lo, hi] = COURSE.gaps[stretch];
      x += LENGTH[kind] + (lo + rand() * (hi - lo)) * scale;
    }
    if (hosts.length) {
      const at = stretch === 'intro' ? Math.min(1, hosts.length - 1)
        : stretch === 'gauntlet' ? hosts.length - 1
        : stretch === 'mineRun' && hosts.some((h) => h.pair) ? hosts.findIndex((h) => h.pair)
        : Math.floor(hosts.length / 2);
      items.push({ kind: 'ice', x: hosts[at].x });
    }
    if (stretch === 'airRaid') {
      for (let w = 0; w < COURSE.raidWaves; w++) {
        items.push({ kind: 'wave', x: first + ((last - first) * w) / COURSE.raidWaves, air: sector.air[Math.floor(rand() * sector.air.length)] });
      }
    }
    items.push({ kind: 'beacon', x: segEnd });
    beacons.push(segEnd);
    segStart = segEnd;
  });
  items.sort((a, b) => a.x - b.x);
  return { index, lap, startX, endX: segStart, beacons, items };
}
