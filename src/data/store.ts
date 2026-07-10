import { create } from 'zustand';
import type { Compound, Descriptors } from '../chem/types';

interface AppState {
  compounds: Compound[];
  /** Row the user has clicked in the table (to highlight / focus). */
  selectedId: string | null;
  /** Transient status ("updating…", errors) shown in the Compounds header. */
  status: string | null;
  /** Replace the table with the molecules currently on the canvas. */
  setCompounds: (list: Descriptors[]) => void;
  select: (id: string | null) => void;
  setStatus: (status: string | null) => void;
}

/** Stable row id: InChIKey (so a row keeps its identity while other fragments
 *  are edited), disambiguated by index when two fragments are identical. */
function rowId(d: Descriptors, index: number): string {
  return `${d.inchiKey || 'x'}#${index}`;
}

export const useStore = create<AppState>((set) => ({
  compounds: [],
  selectedId: null,
  status: null,
  setCompounds: (list) =>
    set((s) => {
      const compounds: Compound[] = list.map((d, i) => ({ id: rowId(d, i), ...d }));
      const stillThere = compounds.some((c) => c.id === s.selectedId);
      return { compounds, selectedId: stillThere ? s.selectedId : null };
    }),
  select: (id) => set({ selectedId: id }),
  setStatus: (status) => set({ status }),
}));
