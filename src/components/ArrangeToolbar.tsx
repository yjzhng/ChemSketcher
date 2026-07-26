import type { CSSProperties } from 'react';
import Tooltip from './Tooltip';
import type { ArrangeMode } from '../chem/arrange';

/**
 * Floating toolbar that appears over the canvas when the selection spans two or
 * more distinct molecules. Tile packs them into a grid; align snaps them to a
 * shared edge/center; distribute equalizes the spacing. Each button just reports
 * an ArrangeMode — SketchEditor does the actual reposition. `style` positions it
 * below the selection (computed by SketchEditor from the screen transform).
 */
export default function ArrangeToolbar({
  count,
  onArrange,
  style,
}: {
  count: number;
  onArrange: (mode: ArrangeMode) => void;
  style?: CSSProperties;
}) {
  return (
    <div className="arrange-bar" role="toolbar" aria-label="Arrange selected molecules" style={style}>
      <span className="arrange-count">{count} molecules</span>

      <span className="arrange-sep" />

      <Tooltip label="Tile into a grid">
        <button className="arrange-btn" onClick={() => onArrange({ kind: 'grid' })} aria-label="Tile into a grid">
          <GridIcon />
        </button>
      </Tooltip>

      <span className="arrange-sep" />

      <span className="arrange-group" aria-label="Align">
        <Tooltip label="Align left edges">
          <button className="arrange-btn" onClick={() => onArrange({ kind: 'align', edge: 'left' })} aria-label="Align left edges">
            <AlignIcon dir="left" />
          </button>
        </Tooltip>
        <Tooltip label="Align horizontal centers">
          <button className="arrange-btn" onClick={() => onArrange({ kind: 'align', edge: 'centerX' })} aria-label="Align horizontal centers">
            <AlignIcon dir="centerX" />
          </button>
        </Tooltip>
        <Tooltip label="Align right edges">
          <button className="arrange-btn" onClick={() => onArrange({ kind: 'align', edge: 'right' })} aria-label="Align right edges">
            <AlignIcon dir="right" />
          </button>
        </Tooltip>
        <Tooltip label="Align top edges">
          <button className="arrange-btn" onClick={() => onArrange({ kind: 'align', edge: 'top' })} aria-label="Align top edges">
            <AlignIcon dir="top" />
          </button>
        </Tooltip>
        <Tooltip label="Align vertical centers">
          <button className="arrange-btn" onClick={() => onArrange({ kind: 'align', edge: 'centerY' })} aria-label="Align vertical centers">
            <AlignIcon dir="centerY" />
          </button>
        </Tooltip>
        <Tooltip label="Align bottom edges">
          <button className="arrange-btn" onClick={() => onArrange({ kind: 'align', edge: 'bottom' })} aria-label="Align bottom edges">
            <AlignIcon dir="bottom" />
          </button>
        </Tooltip>
      </span>

      <span className="arrange-sep" />

      <span className="arrange-group" aria-label="Distribute">
        <Tooltip label="Distribute horizontally (equal gaps)">
          <button className="arrange-btn" onClick={() => onArrange({ kind: 'distribute', axis: 'horizontal' })} aria-label="Distribute horizontally">
            <DistributeIcon axis="horizontal" />
          </button>
        </Tooltip>
        <Tooltip label="Distribute vertically (equal gaps)">
          <button className="arrange-btn" onClick={() => onArrange({ kind: 'distribute', axis: 'vertical' })} aria-label="Distribute vertically">
            <DistributeIcon axis="vertical" />
          </button>
        </Tooltip>
      </span>
    </div>
  );
}

/* ---- icons (16×16, currentColor) ---------------------------------------- */

function GridIcon() {
  const s = { fill: 'currentColor' };
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" rx="1" {...s} />
      <rect x="9" y="2" width="5" height="5" rx="1" {...s} />
      <rect x="2" y="9" width="5" height="5" rx="1" {...s} />
      <rect x="9" y="9" width="5" height="5" rx="1" {...s} />
    </svg>
  );
}

function AlignIcon({ dir }: { dir: 'left' | 'right' | 'centerX' | 'top' | 'bottom' | 'centerY' }) {
  const line = { stroke: 'currentColor', strokeWidth: 1.4 };
  const bar = { fill: 'currentColor' };
  // Horizontal-axis aligns (left/right/centerX): a guide line + two bars snapped to it.
  if (dir === 'left' || dir === 'right' || dir === 'centerX') {
    const gx = dir === 'left' ? 3 : dir === 'right' ? 13 : 8;
    const b1 = dir === 'left' ? 3 : dir === 'right' ? 5 : 3.5;
    const b2 = dir === 'left' ? 3 : dir === 'right' ? 8 : 5;
    const w1 = dir === 'left' ? 8 : dir === 'right' ? 8 : 9;
    const w2 = dir === 'left' ? 5 : dir === 'right' ? 5 : 6;
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <line x1={gx} y1="2" x2={gx} y2="14" {...line} />
        <rect x={b1} y="4" width={w1} height="3" rx="1" {...bar} />
        <rect x={b2} y="9" width={w2} height="3" rx="1" {...bar} />
      </svg>
    );
  }
  // Vertical-axis aligns (top/bottom/centerY): a horizontal guide + two bars.
  const gy = dir === 'top' ? 3 : dir === 'bottom' ? 13 : 8;
  const y1 = dir === 'top' ? 3 : dir === 'bottom' ? 3 : 3.5;
  const y2 = dir === 'top' ? 3 : dir === 'bottom' ? 8 : 5;
  const h1 = dir === 'top' ? 8 : dir === 'bottom' ? 8 : 9;
  const h2 = dir === 'top' ? 5 : dir === 'bottom' ? 5 : 6;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <line x1="2" y1={gy} x2="14" y2={gy} {...line} />
      <rect x="4" y={y1} width="3" height={h1} rx="1" {...bar} />
      <rect x="9" y={y2} width="3" height={h2} rx="1" {...bar} />
    </svg>
  );
}

function DistributeIcon({ axis }: { axis: 'horizontal' | 'vertical' }) {
  const bar = { fill: 'currentColor' };
  if (axis === 'horizontal') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.5" y="4" width="3" height="8" rx="1" {...bar} />
        <rect x="6.5" y="4" width="3" height="8" rx="1" {...bar} />
        <rect x="11.5" y="4" width="3" height="8" rx="1" {...bar} />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="4" y="1.5" width="8" height="3" rx="1" {...bar} />
      <rect x="4" y="6.5" width="8" height="3" rx="1" {...bar} />
      <rect x="4" y="11.5" width="8" height="3" rx="1" {...bar} />
    </svg>
  );
}
