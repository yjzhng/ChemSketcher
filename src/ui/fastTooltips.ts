/**
 * Fast tooltips for a third-party subtree that uses native `title` attributes
 * (Ketcher's toolbar does — ~76 buttons). The native `title` tooltip has a
 * long, non-configurable browser delay, so we:
 *   1. Move every `title` → `data-tip` (and remove `title`) so the slow native
 *      tooltip never fires — kept in sync via a MutationObserver, since Ketcher
 *      re-renders and re-adds titles.
 *   2. Show our own themed tooltip (the `.tip` element) after a short delay,
 *      via delegated hover handling on the root.
 *
 * Returns a cleanup function.
 */
import { hideTip, showTip } from './tooltip';

export function installFastTooltips(root: HTMLElement): () => void {
  const stripTitle = (el: Element) => {
    if (el.hasAttribute('title')) {
      const t = el.getAttribute('title') ?? '';
      if (t) el.setAttribute('data-tip', t);
      el.removeAttribute('title'); // kills the slow native tooltip
    }
  };
  const walk = (node: Element) => {
    stripTitle(node);
    node.querySelectorAll('[title]').forEach(stripTitle);
  };
  walk(root);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.target instanceof Element) stripTitle(m.target);
      else if (m.type === 'childList') {
        m.addedNodes.forEach((n) => {
          if (n instanceof Element) walk(n);
        });
      }
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['title'],
  });

  // Delegated hover → shared tooltip controller (handles delay + edge-clamping).
  let current: Element | null = null;

  const onOver = (e: Event) => {
    const target = (e.target as Element)?.closest?.('[data-tip]');
    if (!target || target === current) return;
    current = target;
    showTip(target, target.getAttribute('data-tip') ?? '');
  };
  const onOut = (e: Event) => {
    const related = (e as MouseEvent).relatedTarget as Element | null;
    if (current && related && current.contains(related)) return;
    current = null;
    hideTip();
  };

  root.addEventListener('mouseover', onOver, true);
  root.addEventListener('mouseout', onOut, true);
  root.addEventListener('mousedown', hideTip, true);
  window.addEventListener('scroll', hideTip, true);

  return () => {
    observer.disconnect();
    root.removeEventListener('mouseover', onOver, true);
    root.removeEventListener('mouseout', onOut, true);
    root.removeEventListener('mousedown', hideTip, true);
    window.removeEventListener('scroll', hideTip, true);
    hideTip();
  };
}
