import { useEffect, useRef, useState } from 'react';
import { Editor } from 'ketcher-react';
import { StandaloneStructServiceProvider } from 'ketcher-standalone';
import type { Ketcher } from 'ketcher-core';
import 'ketcher-react/dist/index.css';
import { useStore } from '../data/store';
import { computeCompounds } from '../chem/client';
import { installFastTooltips } from '../ui/fastTooltips';

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

  // Clean up any pending timers / tooltip listeners on unmount.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (errorTimer.current) clearTimeout(errorTimer.current);
      tooltipCleanup.current?.();
    };
  }, []);

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
        <Editor
          staticResourcesUrl=""
          structServiceProvider={structServiceProvider}
          errorHandler={handleKetcherError}
          onInit={(k: Ketcher) => {
            ketcherRef.current = k;
            // Expose the instance (Ketcher's conventional global) for debugging
            // and scripting.
            (window as Window & { ketcher?: Ketcher }).ketcher = k;
            k.editor.subscribe('change', scheduleRefresh);
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
