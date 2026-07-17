import Tooltip from './Tooltip';

/** Where the properties table sits relative to the sketch canvas. */
export type TablePos = 'left' | 'bottom' | 'right';

export const TABLE_POSITIONS: TablePos[] = ['left', 'bottom', 'right'];

/** VS Code-style layout glyph: a window outline with the table's region shaded. */
function PosIcon({ pos, filled }: { pos: TablePos; filled: boolean }) {
  const stroke = { stroke: 'currentColor', strokeWidth: 1.2 };
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" {...stroke} />
      {pos === 'right' && (
        <>
          <line x1="9.5" y1="2.5" x2="9.5" y2="13.5" {...stroke} />
          {filled && <rect x="9.5" y="2.5" width="5" height="11" fill="currentColor" opacity="0.35" />}
        </>
      )}
      {pos === 'left' && (
        <>
          <line x1="6.5" y1="2.5" x2="6.5" y2="13.5" {...stroke} />
          {filled && <rect x="1.5" y="2.5" width="5" height="11" fill="currentColor" opacity="0.35" />}
        </>
      )}
      {pos === 'bottom' && (
        <>
          <line x1="1.5" y1="9.5" x2="14.5" y2="9.5" {...stroke} />
          {filled && <rect x="1.5" y="9.5" width="13" height="4" fill="currentColor" opacity="0.35" />}
        </>
      )}
    </svg>
  );
}

/**
 * Table layout picker (top-right of the main nav). Each button docks the
 * properties table to that side; clicking the active one hides the table again —
 * so no separate show/hide toggle is needed.
 */
export default function PanelControls({
  showTable,
  tablePos,
  onPick,
}: {
  showTable: boolean;
  tablePos: TablePos;
  onPick: (p: TablePos) => void;
}) {
  return (
    <div className="panel-controls">
      <span className="muted panel-controls-label">Property table</span>
      {TABLE_POSITIONS.map((p) => {
        const active = showTable && tablePos === p;
        const label = active ? 'Hide properties table' : `Table on the ${p}`;
        return (
          <Tooltip key={p} label={label}>
            <button
              type="button"
              className={`header-btn pos-btn ${active ? 'active' : ''}`}
              onClick={() => onPick(p)}
              aria-label={label}
              aria-pressed={active}
            >
              <PosIcon pos={p} filled={active} />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
