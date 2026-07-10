import type { ComputeResponse, Descriptors } from './types';

/**
 * Ask the Python RDKit backend to compute descriptors for everything currently
 * on the canvas. Returns one entry per disconnected molecule (empty if the
 * canvas is blank).
 *
 * We send the molfile (preserves the 2D coordinates the user drew, so each
 * returned SVG matches the sketch); SMILES is a fallback the backend can also
 * accept. Requests go to /api/compute, which Vite proxies to the backend.
 */
export async function computeCompounds(input: {
  molfile?: string;
  smiles?: string;
}): Promise<Descriptors[]> {
  let res: Response;
  try {
    res = await fetch('/api/compute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error(
      'Cannot reach the RDKit backend. Is it running? (server/.venv/bin/python server/app.py)',
    );
  }
  if (!res.ok) {
    throw new Error(`Backend returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as ComputeResponse;
  if (!data.ok) throw new Error(data.error);
  return data.compounds;
}
