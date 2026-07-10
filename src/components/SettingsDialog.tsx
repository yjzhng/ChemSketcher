import { useEffect } from 'react';
import { COLUMN_DEFS } from '../data/columns';
import { useSettings } from '../data/settings';

/**
 * Sectioned settings modal. Currently one section (table columns); add more
 * <section className="settings-section"> blocks as settings grow.
 */
export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const columnVisibility = useSettings((s) => s.columnVisibility);
  const toggleColumn = useSettings((s) => s.toggleColumn);
  const setAllColumns = useSettings((s) => s.setAllColumns);
  const resetColumns = useSettings((s) => s.resetColumns);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <section className="settings-section">
            <div className="section-head">
              <h3>Table columns</h3>
              <div className="section-actions">
                <button className="ghost" onClick={() => setAllColumns(true)}>
                  All
                </button>
                <button className="ghost" onClick={() => setAllColumns(false)}>
                  None
                </button>
                <button className="ghost" onClick={resetColumns}>
                  Reset
                </button>
              </div>
            </div>
            <p className="muted section-hint">
              Choose which columns appear in the properties table.
            </p>
            <div className="column-grid">
              {COLUMN_DEFS.map((c) => (
                <label key={c.id} className="check">
                  <input
                    type="checkbox"
                    checked={columnVisibility[c.id] !== false}
                    onChange={() => toggleColumn(c.id)}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
