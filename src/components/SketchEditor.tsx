import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Editor } from 'ketcher-react';
import { StandaloneStructServiceProvider } from 'ketcher-standalone';
import type { Ketcher } from 'ketcher-core';
import 'ketcher-react/dist/index.css';
import { useStore } from '../data/store';
import { computeCompounds } from '../chem/client';
import { installFastTooltips } from '../ui/fastTooltips';
import ArrangeToolbar from './ArrangeToolbar';
import { arrange, type ArrangeMode } from '../chem/arrange';

// The 2D render editor exposed as `ketcher.editor` (molecules mode). Its
// selection/struct surface isn't in Ketcher's public typings, so we describe
// just the bits we use. atoms is a Pool: its key order is the order getMolfile
// writes atoms, which is how we map selected atom ids → molblock indices.
interface RenderEditor {
  selection(): { atoms?: number[] } | null;
  struct(): {
    atoms: {
      keys(): Iterable<number>;
      get(id: number): { fragment?: number | null; pp?: { x: number; y: number } } | undefined;
    };
  };
  subscribe(event: string, cb: (...args: unknown[]) => void): unknown;
  // Render surface: the root <svg> (paper.canvas) carries the zoom/pan viewBox,
  // so its getScreenCTM maps SVG user-space → screen px. A model coordinate maps
  // to user-space by × microModeScale (Ketcher's modelToCanvas, no offset).
  render?: {
    paper?: { canvas?: SVGSVGElement };
    options?: { microModeScale?: number };
  };
}
const asRenderEditor = (k: Ketcher): RenderEditor => k.editor as unknown as RenderEditor;

// Where the arrange toolbar sits: horizontal center + vertical top/bottom of the
// selection, in pixels relative to the ketcher-host.
interface SelBox {
  cx: number;
  top: number;
  bottom: number;
}

// Created once; instantiates the Indigo WASM worker on first use (browser only).
const structServiceProvider = new StandaloneStructServiceProvider();

// How long to wait after the last edit before recomputing (coalesces the burst
// of change events Ketcher fires while dragging/drawing).
const DEBOUNCE_MS = 350;

/**
 * The EPAM Ketcher structure editor. Rather than a manual "add" step, it
 * subscribes to Ketcher's change events and pushes whatever is on the canvas
 * to the property table automatically — every disconnected molecule becomes a
 * row and updates live as you draw.
 */
export default function SketchEditor() {
  const [error, setError] = useState<string | null>(null);
  const [smilesInput, setSmilesInput] = useState('');
  // How many distinct molecules the current selection spans — drives the
  // arrange toolbar (shown at ≥2) — and where to anchor the toolbar (below the
  // selection, in host-relative px).
  const [selCount, setSelCount] = useState(0);
  const [selBox, setSelBox] = useState<SelBox | null>(null);
  // Status ("updating…", errors) is shown in the Compounds header (right panel).
  const setStatus = useStore((s) => s.setStatus);

  const ketcherRef = useRef<Ketcher | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0); // guards against out-of-order responses
  const hostRef = useRef<HTMLDivElement>(null);
  const tooltipCleanup = useRef<(() => void) | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ketcher/Indigo routes internal conversion hiccups here — many are transient
  // and benign (e.g. "Convert error! ... is not a base reaction" while editing,
  // or a half-typed SMILES in our input). Log everything for debugging, but
  // don't alarm the user with the noisy conversion ones, and auto-dismiss the
  // rest so a stale banner never lingers.
  const handleKetcherError = (m: unknown) => {
    const msg = String(m);
    console.warn('[ketcher]', msg);
    if (/convert error|not a base (reaction|molecule)/i.test(msg)) return;
    setError(msg);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 6000);
  };

  // SMILES → structure: render a typed/pasted SMILES onto the canvas. Ketcher's
  // change event then flows through the normal path and updates the table.
  const loadSmiles = async () => {
    const s = smilesInput.trim();
    const k = ketcherRef.current;
    if (!s || !k) return;
    try {
      await k.setMolecule(s);
      setStatus(null);
    } catch {
      setStatus('Could not parse that SMILES.');
    }
  };

  // Recompute the whole canvas and replace the table. Only the newest request's
  // result is applied (stale ones are dropped).
  const refresh = async () => {
    const k = ketcherRef.current;
    if (!k) return;
    const mine = ++seq.current;
    setStatus('updating…');
    try {
      const molfile = await k.getMolfile().catch(() => '');
      const smiles = await k.getSmiles().catch(() => '');
      const compounds = await computeCompounds({ molfile, smiles });
      if (mine !== seq.current) return; // a newer edit already superseded this
      useStore.getState().setCompounds(compounds);
      setStatus(null);
    } catch (err) {
      if (mine !== seq.current) return;
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const scheduleRefresh = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(refresh, DEBOUNCE_MS);
  };

  // The selection's bounding box in host-relative pixels, by mapping each
  // selected atom's model coordinate through the SVG's screen transform (which
  // already accounts for zoom/pan/scroll). Null if it can't be determined.
  const selectionScreenBox = (k: Ketcher, atoms: number[]): SelBox | null => {
    const ed = asRenderEditor(k);
    const host = hostRef.current;
    const svg = ed.render?.paper?.canvas;
    const scale = ed.render?.options?.microModeScale;
    if (!host || !svg || !scale || typeof svg.getScreenCTM !== 'function') return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const struct = ed.struct();
    const pt = svg.createSVGPoint();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let found = false;
    for (const id of atoms) {
      const pp = struct.atoms.get(id)?.pp;
      if (!pp) continue;
      pt.x = pp.x * scale;
      pt.y = pp.y * scale;
      const s = pt.matrixTransform(ctm);
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x);
      maxY = Math.max(maxY, s.y);
      found = true;
    }
    if (!found) return null;
    const r = host.getBoundingClientRect();
    return { cx: (minX + maxX) / 2 - r.left, top: minY - r.top, bottom: maxY - r.top };
  };

  // Count how many distinct molecules (fragments) the current selection covers,
  // using Ketcher's own fragment assignment, and where to anchor the toolbar.
  // Cheap enough for every selection change; the toolbar shows at ≥2.
  const updateSelection = () => {
    const k = ketcherRef.current;
    if (!k) {
      setSelCount(0);
      setSelBox(null);
      return;
    }
    const atoms = asRenderEditor(k).selection()?.atoms ?? [];
    if (atoms.length === 0) {
      setSelCount(0);
      setSelBox(null);
      return;
    }
    const struct = asRenderEditor(k).struct();
    const frags = new Set<number>();
    for (const id of atoms) {
      const f = struct.atoms.get(id)?.fragment;
      if (f != null) frags.add(f);
    }
    setSelCount(frags.size);
    setSelBox(frags.size >= 2 ? selectionScreenBox(k, atoms) : null);
  };

  // Reposition the selected molecules (tile / align / distribute). We work on
  // the molblock (pure geometry, structures untouched) and write it back with
  // setMolecule. Selection is a set of atom ids; map them to molblock indices
  // via the struct's atom order, which is the order getMolfile emits.
  const applyArrange = async (mode: ArrangeMode) => {
    const k = ketcherRef.current;
    if (!k) return;
    try {
      const ed = asRenderEditor(k);
      const selAtoms = ed.selection()?.atoms ?? [];
      const molblock = await k.getMolfile();
      const ids = Array.from(ed.struct().atoms.keys());
      const idToIndex = new Map<number, number>();
      ids.forEach((id, i) => idToIndex.set(id, i));
      const selIdx = new Set<number>();
      for (const id of selAtoms) {
        const i = idToIndex.get(id);
        if (i !== undefined) selIdx.add(i);
      }
      const next = arrange(molblock, selIdx.size ? selIdx : 'all', mode);
      if (next !== molblock) await k.setMolecule(next);
    } catch (err) {
      handleKetcherError(err);
    }
  };

  // Latest updateSelection for the event listeners below (they're attached once).
  const updateSelRef = useRef(updateSelection);
  updateSelRef.current = updateSelection;

  // Keep the toolbar glued to the selection while the user zooms, pans, or
  // resizes — those change the screen transform without firing selectionChange.
  // Recompute on the next frame (coalesced) so a burst of wheel events is cheap.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let raf = 0;
    const reanchor = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        updateSelRef.current();
      });
    };
    host.addEventListener('wheel', reanchor, { passive: true, capture: true });
    host.addEventListener('scroll', reanchor, { passive: true, capture: true });
    window.addEventListener('resize', reanchor);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      host.removeEventListener('wheel', reanchor, { capture: true } as EventListenerOptions);
      host.removeEventListener('scroll', reanchor, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', reanchor);
    };
  }, []);

  // Clean up any pending timers / tooltip listeners on unmount.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (errorTimer.current) clearTimeout(errorTimer.current);
      tooltipCleanup.current?.();
    };
  }, []);

  // Anchor the toolbar below the selection (flipping above if it would overflow
  // the canvas bottom), centered on it. Falls back to top-center if the screen
  // box couldn't be computed.
  const BAR_H = 34;
  const MARGIN = 10;
  const HALF = 130; // rough half-width, for horizontal clamping
  let barStyle: CSSProperties = { left: '50%', top: MARGIN, transform: 'translateX(-50%)' };
  if (selBox) {
    const host = hostRef.current;
    const hw = host?.clientWidth ?? 0;
    const hh = host?.clientHeight ?? 0;
    let top = selBox.bottom + MARGIN;
    if (hh && top + BAR_H > hh) top = Math.max(MARGIN, selBox.top - MARGIN - BAR_H);
    let cx = selBox.cx;
    if (hw) cx = Math.min(Math.max(cx, HALF), hw - HALF);
    barStyle = { left: cx, top, transform: 'translateX(-50%)' };
  }

  return (
    <div className="sketch-panel">
      <form
        className="smiles-bar"
        onSubmit={(e) => {
          e.preventDefault();
          loadSmiles();
        }}
      >
        <label className="smiles-label">SMILES</label>
        <input
          className="smiles-input"
          type="text"
          spellCheck={false}
          placeholder="paste to draw…"
          value={smilesInput}
          onChange={(e) => setSmilesInput(e.target.value)}
        />
        <button type="submit" className="smiles-load" disabled={!smilesInput.trim()}>
          Load
        </button>
      </form>

      {error && (
        <div className="error-inline">
          Sketcher error: {error}
          <button className="error-dismiss" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <div className="ketcher-host" ref={hostRef}>
        {selCount >= 2 && (
          <ArrangeToolbar count={selCount} onArrange={applyArrange} style={barStyle} />
        )}
        <Editor
          staticResourcesUrl=""
          structServiceProvider={structServiceProvider}
          errorHandler={handleKetcherError}
          onInit={(k: Ketcher) => {
            ketcherRef.current = k;
            // Expose the instance (Ketcher's conventional global) for debugging
            // and scripting.
            (window as Window & { ketcher?: Ketcher }).ketcher = k;
            k.editor.subscribe('change', () => {
              scheduleRefresh();
              updateSelection(); // a deleted/added molecule can change the selection
            });
            // Ketcher fires this on every selection change (rectangle/lasso, click).
            asRenderEditor(k).subscribe('selectionChange', updateSelection);
            refresh(); // reflect any initial structure
            // Replace Ketcher's slow native `title` tooltips with fast ones.
            if (hostRef.current && !tooltipCleanup.current) {
              tooltipCleanup.current = installFastTooltips(hostRef.current);
            }
          }}
        />
      </div>
    </div>
  );
}
