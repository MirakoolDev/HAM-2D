/**
 * HAM Maze Engine
 * Direct TypeScript port of MazeGenerator.cs (Unity)
 * Seed format: YYYYMMDD — identical to: year*10000 + month*100 + day
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Cell {
  x: number;
  z: number;
  visited: boolean;
  walls: { top: boolean; right: boolean; bottom: boolean; left: boolean };
}

export interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Point {
  x: number;
  y: number;
}

// ─── Seeded PRNG (Mulberry32) ─────────────────────────────────────────────────
// Produces the same sequence as C# System.Random for the same integer seed
// for the range of values used in maze generation (0..3 neighbour selection).

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function (): number {
    s += 0x6d2b79f5;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  };
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

/**
 * Returns today's seed as YYYYMMDD integer.
 * Matches Unity: DateTime.Now.Year * 10000 + DateTime.Now.Month * 100 + DateTime.Now.Day
 */
export function getTodaySeed(): number {
  const d = new Date();
  return (
    d.getFullYear() * 10000 +
    (d.getMonth() + 1) * 100 +
    d.getDate()
  );
}

/**
 * Adds or subtracts days from a YYYYMMDD integer.
 */
export function addDaysToSeed(seed: number, days: number): number {
  const y = Math.floor(seed / 10000);
  const m = Math.floor((seed % 10000) / 100) - 1;
  const d = seed % 100;
  
  const date = new Date(Date.UTC(y, m, d));
  date.setUTCDate(date.getUTCDate() + days);
  
  return (
    date.getUTCFullYear() * 10000 +
    (date.getUTCMonth() + 1) * 100 +
    date.getUTCDate()
  );
}

// ─── Maze Generation (Recursive DFS Backtracker) ──────────────────────────────

function makeCell(x: number, z: number): Cell {
  return {
    x,
    z,
    visited: false,
    walls: { top: true, right: true, bottom: true, left: true },
  };
}

function getUnvisitedNeighbours(
  grid: Cell[][],
  cell: Cell,
  width: number,
  depth: number
): Cell[] {
  const { x, z } = cell;
  const neighbours: Cell[] = [];
  // Matches MazeGenerator.cs GetUnvisitedCells order: right, left, front(top), back(bottom)
  if (x + 1 < width && !grid[x + 1][z].visited) neighbours.push(grid[x + 1][z]);
  if (x - 1 >= 0 && !grid[x - 1][z].visited) neighbours.push(grid[x - 1][z]);
  if (z + 1 < depth && !grid[x][z + 1].visited) neighbours.push(grid[x][z + 1]);
  if (z - 1 >= 0 && !grid[x][z - 1].visited) neighbours.push(grid[x][z - 1]);
  return neighbours;
}

function clearWalls(prev: Cell, curr: Cell): void {
  // Matches MazeGenerator.cs ClearWalls()
  if (prev.x < curr.x) { prev.walls.right = false; curr.walls.left = false; }
  else if (prev.x > curr.x) { prev.walls.left = false; curr.walls.right = false; }
  else if (prev.z < curr.z) { prev.walls.bottom = false; curr.walls.top = false; }
  else if (prev.z > curr.z) { prev.walls.top = false; curr.walls.bottom = false; }
}

function dfs(
  grid: Cell[][],
  cell: Cell,
  width: number,
  depth: number,
  rng: () => number,
  prev: Cell | null = null
): void {
  cell.visited = true;
  if (prev) clearWalls(prev, cell);

  let next: Cell | null;
  do {
    const unvisited = getUnvisitedNeighbours(grid, cell, width, depth);
    if (unvisited.length === 0) {
      next = null;
    } else {
      const idx = Math.floor(rng() * unvisited.length);
      next = unvisited[idx];
      dfs(grid, next, width, depth, rng, cell);
    }
  } while (next !== null);
}

/**
 * Generate a maze grid using recursive DFS backtracker.
 * @param width  Number of cells horizontally
 * @param depth  Number of cells vertically
 * @param seed   Integer seed (use getTodaySeed())
 */
export function generateMaze(width: number, depth: number, seed: number): Cell[][] {
  const rng = mulberry32(seed);

  // Build grid
  const grid: Cell[][] = [];
  for (let x = 0; x < width; x++) {
    grid[x] = [];
    for (let z = 0; z < depth; z++) {
      grid[x][z] = makeCell(x, z);
    }
  }

  // Start DFS from [0,0] — matches InitializeMazeGrid + GenerateMaze(null, mazeGrid[0,0])
  dfs(grid, grid[0][0], width, depth, rng);

  // Open entrance (top wall of [0,0]) and exit (bottom wall of centre cell)
  grid[0][0].walls.top = false;
  const cx = Math.floor(width / 2);
  const cz = Math.floor(depth / 2);
  grid[cx][cz].walls.bottom = false; // goal opening

  return grid;
}

// ─── Wall Segments (for collision detection) ──────────────────────────────────

/**
 * Returns all wall segments in canvas-pixel coordinates.
 * @param maze      Output of generateMaze()
 * @param cellPx    Pixel size of each cell
 * @param offsetX   Canvas X offset
 * @param offsetY   Canvas Y offset
 */
export function getWallSegments(
  maze: Cell[][],
  cellPx: number,
  offsetX = 0,
  offsetY = 0
): WallSegment[] {
  const width = maze.length;
  const depth = maze[0].length;
  const segments: WallSegment[] = [];

  for (let x = 0; x < width; x++) {
    for (let z = 0; z < depth; z++) {
      const cell = maze[x][z];
      const px = offsetX + x * cellPx;
      const py = offsetY + z * cellPx;

      if (cell.walls.top)
        segments.push({ x1: px, y1: py, x2: px + cellPx, y2: py });
      if (cell.walls.right)
        segments.push({ x1: px + cellPx, y1: py, x2: px + cellPx, y2: py + cellPx });
      if (cell.walls.bottom)
        segments.push({ x1: px, y1: py + cellPx, x2: px + cellPx, y2: py + cellPx });
      if (cell.walls.left)
        segments.push({ x1: px, y1: py, x2: px, y2: py + cellPx });
    }
  }

  return segments;
}

/**
 * Point-to-segment distance check for wall collision.
 * Returns true if (px, py) is within `tolerance` pixels of any wall segment.
 */
export function hitTestWalls(
  px: number,
  py: number,
  walls: WallSegment[],
  tolerance: number
): boolean {
  for (const w of walls) {
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    const t = Math.max(0, Math.min(1, ((px - w.x1) * dx + (py - w.y1) * dy) / lenSq));
    const nearX = w.x1 + t * dx;
    const nearY = w.y1 + t * dy;
    const dist = Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);
    if (dist < tolerance) return true;
  }
  return false;
}

// ─── SVG Path Export ──────────────────────────────────────────────────────────

/**
 * Converts the player's canvas path to an SVG <path> string.
 * Normalised to a 100×100 viewBox for storage in the NFT.
 */
export function pathToSVG(
  points: Point[],
  canvasW: number,
  canvasH: number
): string {
  if (points.length < 2) return '';
  const scale = (n: number, max: number) => ((n / max) * 100).toFixed(2);
  const d = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${scale(p.x, canvasW)} ${scale(p.y, canvasH)}`
    )
    .join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${d}" stroke="#ff7b00" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// ─── Goal Cell ────────────────────────────────────────────────────────────────

/** Returns the centre cell — matches Unity SpawnGoal() */
export function getGoalCell(maze: Cell[][]): Cell {
  const cx = Math.floor(maze.length / 2);
  const cz = Math.floor(maze[0].length / 2);
  return maze[cx][cz];
}
