import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import SketchEditor from './components/SketchEditor';
import PropertiesTable from './components/PropertiesTable';
import SettingsDialog from './components/SettingsDialog';
import Tooltip from './components/Tooltip';
import PanelControls, { type TablePos } from './components/PanelControls';
import { openFile, saveAsFile, saveToHandle } from './ui/fileIo';
import type { Ketcher } from 'ketcher-core';

const TABLE_KEY = 'chemsketcher-show-table';
const POS_KEY = 'chemsketcher-table-pos';
const SIZE_KEY = 'chemsketcher-table-size';

// Keep both panes usable no matter how far the divider is dragged.
const MIN_TABLE = 220;
const MIN_CANVAS = 380;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  const fileHandle = useRef<FileSystemFileHandle | null>(null);
  const fileName = useRef('structure.mol');

  const [showTable, setShowTable] = useState<boolean>(() => {
    try {
      return localStorage.getItem(TABLE_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [tablePos, setTablePos] = useState<TablePos>(() => {
    try {
      const v = localStorage.getItem(POS_KEY);
      return v === 'left' || v === 'bottom' || v === 'right' ? v : 'right';
    } catch {
      return 'right';
    }
  });
  // Separate sizes: a side-docked table wants width, a bottom one wants height.
  const [size, setSize] = useState(() => readJson(SIZE_KEY, { w: 620, h: 320 }));

  const vertical = tablePos === 'bottom';
  const tableSize = vertical ? size.h : size.w;

  // One control for both jobs: clicking the side the table is already on hides
  // it; clicking another side moves it there (and reveals it if hidden).
  const pickPos = (p: TablePos) => {
    if (showTable && tablePos === p) {
      setShowTable(false);
      write(TABLE_KEY, '0');
      return;
    }
    setTablePos(p);
    write(POS_KEY, p);
    if (!showTable) {
      setShowTable(true);
      write(TABLE_KEY, '1');
    }
  };

  // Drag the divider to resize. Listeners go on window in the capture phase so
  // the drag survives the pointer leaving the handle and can't be swallowed by
  // Ketcher's canvas; pointer capture (best-effort) plus disabling canvas
  // hit-testing keeps the editor from reacting mid-drag.
  const onDividerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* not a capturable pointer — window listeners below still drive the drag */
    }
    const isVertical = vertical;
    const start = isVertical ? e.clientY : e.clientX;
    const startSize = isVertical ? size.h : size.w;
    // Dragging toward a right/bottom-docked table shrinks it; a left one grows.
    const sign = tablePos === 'left' ? 1 : -1;
    const limit = isVertical ? window.innerHeight : window.innerWidth;

    const move = (ev: globalThis.PointerEvent) => {
      const delta = (isVertical ? ev.clientY : ev.clientX) - start;
      const next = Math.max(MIN_TABLE, Math.min(startSize + sign * delta, limit - MIN_CANVAS));
      setSize((s) => (isVertical ? { ...s, h: next } : { ...s, w: next }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      document.body.classList.remove('resizing');
      setSize((s) => {
        write(SIZE_KEY, s);
        return s;
      });
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    document.body.classList.add('resizing');
  };

  const flash = (m: string) => {
    setFileMsg(m);
    window.setTimeout(() => setFileMsg((cur) => (cur === m ? null : cur)), 3000);
  };
  const ketcher = () => (window as Window & { ketcher?: Ketcher }).ketcher;

  const canvasMolfile = async (): Promise<string | null> => {
    const k = ketcher();
    if (!k) return null;
    try {
      return await k.getMolfile();
    } catch {
      flash('Nothing to save.');
      return null;
    }
  };

  const saveAs = async () => {
    const content = await canvasMolfile();
    if (content == null) return;
    try {
      const res = await saveAsFile(fileName.current, content);
      if (res) {
        fileHandle.current = res.handle;
        fileName.current = res.name;
        flash(`Saved ${res.name}`);
      }
    } catch {
      flash('Save failed.');
    }
  };

  const save = async () => {
    const content = await canvasMolfile();
    if (content == null) return;
    try {
      if (await saveToHandle(fileHandle.current, content)) flash('Saved.');
      else await saveAs(); // no current file yet → prompt for one
    } catch {
      flash('Save failed.');
    }
  };

  const open = async () => {
    const k = ketcher();
    if (!k) return;
    try {
      const picked = await openFile();
      if (!picked) return;
      await k.setMolecule(picked.text);
      fileHandle.current = picked.handle;
      fileName.current = picked.name;
      flash(`Opened ${picked.name}`);
    } catch {
      flash('Could not open that file.');
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>ChemSketcher</h1>
        <div className="file-menu">
          <Tooltip label="Open a structure file">
            <button className="file-btn" onClick={open}>
              Open
            </button>
          </Tooltip>
          <Tooltip label="Save to the current file">
            <button className="file-btn" onClick={save}>
              Save
            </button>
          </Tooltip>
          <Tooltip label="Save to a new file">
            <button className="file-btn" onClick={saveAs}>
              Save As
            </button>
          </Tooltip>
        </div>
        <span className="spacer" />
        {fileMsg && <span className="muted file-msg">{fileMsg}</span>}
        <PanelControls showTable={showTable} tablePos={tablePos} onPick={pickPos} />
      </header>

      <main
        className={`split pos-${tablePos} ${showTable ? '' : 'solo'}`}
        style={{ '--table-size': `${tableSize}px` } as CSSProperties}
      >
        <SketchEditor />
        {showTable && (
          <div
            className="divider"
            role="separator"
            aria-orientation={vertical ? 'horizontal' : 'vertical'}
            onPointerDown={onDividerDown}
          />
        )}
        {showTable && <PropertiesTable onOpenSettings={() => setSettingsOpen(true)} />}
      </main>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
