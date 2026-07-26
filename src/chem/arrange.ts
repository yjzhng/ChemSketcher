// Arrange distinct molecules on the canvas — tile (grid), align, distribute.
//
// This is pure geometry over a V2000 molblock: no Ketcher, no DOM, so it is
// unit-testable headlessly. SketchEditor reads the canvas with getMolfile(),
// hands the text here with the set of selected atoms, and writes the result
// back with setMolecule().
//
// A "molecule" here is a connected component of the bond graph — the same thing
// the user sees as a separate structure. We move each selected component as a
// rigid group (every atom translated by one delta), so structures keep their
// exact geometry and only their positions change.
//
// Coordinates are molblock space: X right, Y UP (chemistry convention, not
// screen). All math stays in that space; Ketcher maps it to the screen.

export type ArrangeMode =
  | { kind: 'grid'; columns?: number; gap?: number }
  | { kind: 'align'; edge: 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY' }
  | { kind: 'distribute'; axis: 'horizontal' | 'vertical' };

interface Atom {
  x: number;
  y: number;
  tail: string; // everything from column 31 on (symbol + flags), preserved verbatim
}

interface Parsed {
  pre: string[]; // header (3 lines) + counts line
  atoms: Atom[];
  post: string[]; // bond block + properties + M END and anything after
  eol: string; // detected line terminator
}

const COORD_W = 10; // V2000 fixed coordinate column width
const DEFAULT_GAP = 2.0; // molblock units (~2 bond lengths) between tiles

/** Format a coordinate the way a V2000 molblock does: width 10, 4 decimals. */
function fmtCoord(n: number): string {
  // Avoid "-0.0000"; keep it stable across platforms.
  const v = Object.is(n, -0) ? 0 : n;
  return v.toFixed(4).padStart(COORD_W);
}

/**
 * Parse just enough of a V2000 molblock to read atom coordinates and bond
 * connectivity and to rewrite coordinates in place. Throws on anything that
 * isn't a V2000 connection table (e.g. a V3000 block), so the caller can skip.
 */
export function parseMolblock(molblock: string): Parsed {
  const eol = molblock.includes('\r\n') ? '\r\n' : '\n';
  const lines = molblock.split(/\r?\n/);
  if (lines.length < 5) throw new Error('molblock too short');

  // Counts line is the 4th line: aaabbb... — atom and bond counts, plus version.
  const counts = lines[3];
  const nAtoms = parseInt(counts.slice(0, 3), 10);
  const nBonds = parseInt(counts.slice(3, 6), 10);
  if (!Number.isFinite(nAtoms) || !Number.isFinite(nBonds)) {
    throw new Error('unparseable counts line');
  }
  if (!/V2000/.test(counts)) throw new Error('not a V2000 molblock');

  const atomStart = 4;
  const atoms: Atom[] = [];
  for (let i = 0; i < nAtoms; i++) {
    const line = lines[atomStart + i];
    if (line == null) throw new Error('truncated atom block');
    atoms.push({
      x: parseFloat(line.slice(0, 10)),
      y: parseFloat(line.slice(10, 20)),
      // z is column 21-30; we keep it by preserving the tail from column 21? No:
      // tail starts at 31 so z is rewritten too. Keep z as-is by capturing 21-30.
      tail: line.slice(20),
    });
  }

  return {
    pre: lines.slice(0, atomStart),
    atoms,
    post: lines.slice(atomStart + nAtoms),
    eol,
  };
}

/** Serialize back to a molblock, writing each atom's current x/y (z untouched). */
export function serializeMolblock(p: Parsed): string {
  const atomLines = p.atoms.map((a) => `${fmtCoord(a.x)}${fmtCoord(a.y)}${a.tail}`);
  return [...p.pre, ...atomLines, ...p.post].join(p.eol);
}

/** Bond list as 0-based atom index pairs, read from the V2000 bond block. */
function readBonds(p: Parsed): Array<[number, number]> {
  const nBonds = parseInt(p.pre[3].slice(3, 6), 10);
  const bonds: Array<[number, number]> = [];
  for (let i = 0; i < nBonds; i++) {
    const line = p.post[i];
    if (line == null) break;
    const a = parseInt(line.slice(0, 3), 10) - 1;
    const b = parseInt(line.slice(3, 6), 10) - 1;
    if (a >= 0 && b >= 0) bonds.push([a, b]);
  }
  return bonds;
}

/**
 * Connected components of the bond graph. Returns an array of components, each
 * a sorted list of 0-based atom indices. Isolated atoms (no bonds) are their own
 * single-atom components.
 */
export function components(p: Parsed): number[][] {
  const n = p.atoms.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (const [a, b] of readBonds(p)) union(a, b);

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(i);
    else groups.set(r, [i]);
  }
  return [...groups.values()];
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
const boxOf = (atoms: Atom[], idxs: number[]): Box => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const i of idxs) {
    const a = atoms[i];
    if (a.x < minX) minX = a.x;
    if (a.y < minY) minY = a.y;
    if (a.x > maxX) maxX = a.x;
    if (a.y > maxY) maxY = a.y;
  }
  return { minX, minY, maxX, maxY };
};
const width = (b: Box) => b.maxX - b.minX;
const height = (b: Box) => b.maxY - b.minY;
const centerX = (b: Box) => (b.minX + b.maxX) / 2;
const centerY = (b: Box) => (b.minY + b.maxY) / 2;

function translate(p: Parsed, idxs: number[], dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  for (const i of idxs) {
    p.atoms[i].x += dx;
    p.atoms[i].y += dy;
  }
}

/** The components that contain at least one selected atom, in reading order. */
function selectedComponents(p: Parsed, selected: Set<number> | 'all'): number[][] {
  const all = components(p);
  const chosen = selected === 'all' ? all : all.filter((c) => c.some((i) => selected.has(i)));
  // Reading order: top row first (larger Y), then left-to-right (smaller X).
  return chosen.sort((c1, c2) => {
    const b1 = boxOf(p.atoms, c1);
    const b2 = boxOf(p.atoms, c2);
    const dy = centerY(b2) - centerY(b1); // higher Y first
    if (Math.abs(dy) > 1e-6) return dy;
    return centerX(b1) - centerX(b2);
  });
}

/**
 * Arrange the selected molecules and return a new molblock. `selected` is a set
 * of 0-based atom indices (matching molblock order), or 'all'. Fewer than two
 * selected molecules is a no-op for every mode (nothing to arrange).
 */
export function arrange(
  molblock: string,
  selected: Set<number> | 'all',
  mode: ArrangeMode,
): string {
  const p = parseMolblock(molblock);
  const groups = selectedComponents(p, selected);
  if (groups.length < 2) return molblock;

  const boxes = groups.map((g) => boxOf(p.atoms, g));

  if (mode.kind === 'align') {
    // Target is the extreme (or mean) edge across the selected boxes; each box
    // shifts along one axis only, keeping its other coordinate.
    const e = mode.edge;
    const targets = {
      left: Math.min(...boxes.map((b) => b.minX)),
      right: Math.max(...boxes.map((b) => b.maxX)),
      top: Math.max(...boxes.map((b) => b.maxY)),
      bottom: Math.min(...boxes.map((b) => b.minY)),
      centerX: boxes.reduce((s, b) => s + centerX(b), 0) / boxes.length,
      centerY: boxes.reduce((s, b) => s + centerY(b), 0) / boxes.length,
    };
    groups.forEach((g, i) => {
      const b = boxes[i];
      if (e === 'left') translate(p, g, targets.left - b.minX, 0);
      else if (e === 'right') translate(p, g, targets.right - b.maxX, 0);
      else if (e === 'centerX') translate(p, g, targets.centerX - centerX(b), 0);
      else if (e === 'top') translate(p, g, 0, targets.top - b.maxY);
      else if (e === 'bottom') translate(p, g, 0, targets.bottom - b.minY);
      else if (e === 'centerY') translate(p, g, 0, targets.centerY - centerY(b));
    });
    return serializeMolblock(p);
  }

  if (mode.kind === 'distribute') {
    // Keep the two extreme molecules fixed; space the rest so the gaps between
    // adjacent bounding boxes are equal along the axis.
    const horizontal = mode.axis === 'horizontal';
    const order = groups
      .map((g, i) => ({ g, b: boxes[i] }))
      .sort((a, b) => (horizontal ? centerX(a.b) - centerX(b.b) : centerY(a.b) - centerY(b.b)));
    const sizes = order.map(({ b }) => (horizontal ? width(b) : height(b)));
    const first = order[0].b;
    const last = order[order.length - 1].b;
    const span = horizontal
      ? width({ minX: first.minX, maxX: last.maxX, minY: 0, maxY: 0 })
      : height({ minY: first.minY, maxY: last.maxY, minX: 0, maxX: 0 });
    const totalSize = sizes.reduce((s, v) => s + v, 0);
    const gap = (span - totalSize) / (order.length - 1);
    // Walk from the first box's leading edge, placing each box's min edge.
    let cursor = horizontal ? first.minX : first.minY;
    for (const { g, b } of order) {
      if (horizontal) {
        translate(p, g, cursor - b.minX, 0);
        cursor += width(b) + gap;
      } else {
        translate(p, g, cursor - b.minY, 0);
        cursor += height(b) + gap;
      }
    }
    return serializeMolblock(p);
  }

  // grid: pack into rows/columns of uniform cell size, anchored at the current
  // selection's top-left so the block stays roughly where it was.
  const gap = mode.gap ?? DEFAULT_GAP;
  const n = groups.length;
  const cols = Math.max(1, mode.columns ?? Math.ceil(Math.sqrt(n)));
  const cellW = Math.max(...boxes.map(width)) + gap;
  const cellH = Math.max(...boxes.map(height)) + gap;
  const overall = boxOf(
    p.atoms,
    groups.flat(),
  );
  const originX = overall.minX; // left
  const originY = overall.maxY; // top (Y up)
  groups.forEach((g, i) => {
    const b = boxes[i];
    const row = Math.floor(i / cols);
    const col = i % cols;
    // Cell center in molblock space; row grows downward (decreasing Y).
    const cellCX = originX + col * cellW + cellW / 2;
    const cellCY = originY - row * cellH - cellH / 2;
    translate(p, g, cellCX - centerX(b), cellCY - centerY(b));
  });
  return serializeMolblock(p);
}

/**
 * Map Ketcher's selected atom ids to the count of distinct molecules they touch,
 * so the UI can decide whether to show the arrange toolbar (needs ≥2). Cheap
 * enough to call on every selection change.
 */
export function selectedMoleculeCount(molblock: string, selectedAtomIds: number[]): number {
  if (selectedAtomIds.length === 0) return 0;
  let p: Parsed;
  try {
    p = parseMolblock(molblock);
  } catch {
    return 0;
  }
  const sel = new Set(selectedAtomIds);
  return components(p).filter((c) => c.some((i) => sel.has(i))).length;
}
