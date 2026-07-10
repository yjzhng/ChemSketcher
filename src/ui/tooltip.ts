/**
 * Shared tooltip controller — a single `.tip` element reused for every tooltip
 * in the app (our React <Tooltip> and the delegated Ketcher-toolbar tooltips).
 *
 * Positions below the target, centered, but clamps to the viewport so it's
 * never clipped by a screen edge: horizontally clamped, and flipped above the
 * target when it would overflow the bottom.
 */
const SHOW_DELAY_MS = 200;
const MARGIN = 8; // keep this far from the viewport edges

let tipEl: HTMLDivElement | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function ensureEl(): HTMLDivElement {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tip';
    tipEl.style.display = 'none';
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function place(target: Element, label: string): void {
  const tip = ensureEl();
  tip.textContent = label;
  // Render first (at 0,0) so we can measure its size, then position + clamp.
  tip.style.left = '0px';
  tip.style.top = '0px';
  tip.style.display = 'block';

  const r = target.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Centered under the target, clamped within the viewport horizontally.
  let left = r.left + r.width / 2 - tw / 2;
  left = Math.max(MARGIN, Math.min(left, vw - tw - MARGIN));

  // Below by default; flip above if it would overflow the bottom edge.
  let top = r.bottom + 6;
  if (top + th > vh - MARGIN) top = r.top - th - 6;
  top = Math.max(MARGIN, Math.min(top, vh - th - MARGIN));

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

/** Show `label` near `target` after the standard delay. */
export function showTip(target: Element, label: string): void {
  if (!label) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => place(target, label), SHOW_DELAY_MS);
}

/** Hide the tooltip and cancel any pending show. */
export function hideTip(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (tipEl) tipEl.style.display = 'none';
}
