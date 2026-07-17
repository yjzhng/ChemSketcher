import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import type { Compound } from '../chem/types';
import { useStore } from '../data/store';
import { useSettings } from '../data/settings';
import { COLUMN_DEFS, NUMERIC_COLUMN_IDS } from '../data/columns';
import Tooltip from './Tooltip';

const col = createColumnHelper<Compound>();

// Header label per column id, from the shared registry (keeps the table and
// the Settings dialog in sync).
const LABEL: Record<string, string> = Object.fromEntries(
  COLUMN_DEFS.map((c) => [c.id, c.label]),
);

/** A monospace value that copies to the clipboard on click (structure→SMILES,
 *  InChIKey, …). Truncates with ellipsis; the full value is in the tooltip. */
function CopyText({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip label={copied ? 'Copied!' : `${value} — click to copy`}>
      <span
        className={`copy ${className ?? ''}`}
        onClick={(e) => {
          e.stopPropagation();
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1000);
          });
        }}
      >
        {copied ? '✓ copied' : value}
      </span>
    </Tooltip>
  );
}

export default function PropertiesTable({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  const compounds = useStore((s) => s.compounds);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const status = useStore((s) => s.status);
  const columnVisibility = useSettings((s) => s.columnVisibility);
  const setColumnVisibility = useSettings((s) => s.setColumnVisibility);
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () => [
      col.display({
        id: 'structure',
        header: 'Structure',
        cell: (ctx) => (
          <div
            className="struct-cell"
            // Backend-rendered RDKit SVG; safe (our own trusted service).
            dangerouslySetInnerHTML={{ __html: ctx.row.original.svg }}
          />
        ),
      }),
      col.accessor('formula', {
        header: 'Formula',
        cell: (c) => <span className="mono">{c.getValue()}</span>,
      }),
      col.accessor('smiles', {
        header: 'SMILES',
        cell: (c) => <CopyText value={c.getValue()} className="mono smiles-cell" />,
      }),
      ...NUMERIC_COLUMN_IDS.map((id) =>
        col.accessor((row) => row[id], {
          id,
          header: LABEL[id],
          cell: (c) => <span className="num">{String(c.getValue())}</span>,
        }),
      ),
      col.accessor('inchiKey', {
        header: 'InChIKey',
        cell: (c) => <CopyText value={c.getValue()} className="mono small" />,
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: compounds,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: (updater) =>
      setColumnVisibility(
        typeof updater === 'function' ? updater(columnVisibility) : updater,
      ),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="table-panel">
      <div className="panel-bar">
        <h2>Compounds</h2>
        <span className="muted">
          {compounds.length} {compounds.length === 1 ? 'structure' : 'structures'}
        </span>
        {status && <span className="status">{status}</span>}
        <span className="spacer" />
        <Tooltip label="Settings">
          <button
            className="header-btn settings-btn"
            onClick={onOpenSettings}
            aria-label="Open settings"
          >
            {/* SVG rather than the ⚙ glyph, which sits off-baseline and renders
                inconsistently across fonts/emoji variants. */}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3.25" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </Tooltip>
      </div>

      {compounds.length === 0 ? (
        <div className="empty">
          Draw one or more structures on the left — their properties appear here
          automatically, one row per molecule.
        </div>
      ) : (
        <div className="table-scroll">
          <table className="prop-table">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      onClick={h.column.getToggleSortingHandler()}
                      className={h.column.getCanSort() ? 'sortable' : ''}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {{ asc: ' ▲', desc: ' ▼' }[h.column.getIsSorted() as string] ?? ''}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={row.original.id === selectedId ? 'selected' : ''}
                  onClick={() => select(row.original.id)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
