import { create } from 'zustand';
import { COLUMN_DEFS } from './columns';

/** Which table columns are visible. Shape matches TanStack's columnVisibility
 *  ({ [columnId]: boolean }); a missing/true entry means visible. Persisted. */
export type ColumnVisibility = Record<string, boolean>;

const KEY = 'chemsketcher-columns';

function allVisible(): ColumnVisibility {
  const v: ColumnVisibility = {};
  for (const c of COLUMN_DEFS) v[c.id] = true;
  return v;
}

function load(): ColumnVisibility {
  const v = allVisible();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(v, JSON.parse(raw) as ColumnVisibility);
  } catch {
    /* ignore malformed/unavailable storage */
  }
  return v;
}

function persist(v: ColumnVisibility): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable — in-memory state still works */
  }
}

interface SettingsState {
  columnVisibility: ColumnVisibility;
  toggleColumn: (id: string) => void;
  setAllColumns: (visible: boolean) => void;
  resetColumns: () => void;
  /** Replace wholesale (used by the table's controlled visibility handler). */
  setColumnVisibility: (v: ColumnVisibility) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  columnVisibility: load(),
  toggleColumn: (id) =>
    set((s) => {
      const v = { ...s.columnVisibility, [id]: s.columnVisibility[id] === false };
      persist(v);
      return { columnVisibility: v };
    }),
  setAllColumns: (visible) =>
    set(() => {
      const v: ColumnVisibility = {};
      for (const c of COLUMN_DEFS) v[c.id] = visible;
      persist(v);
      return { columnVisibility: v };
    }),
  resetColumns: () =>
    set(() => {
      const v = allVisible();
      persist(v);
      return { columnVisibility: v };
    }),
  setColumnVisibility: (v) =>
    set(() => {
      persist(v);
      return { columnVisibility: v };
    }),
}));
