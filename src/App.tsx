import { useRef, useState } from 'react';
import SketchEditor from './components/SketchEditor';
import PropertiesTable from './components/PropertiesTable';
import SettingsDialog from './components/SettingsDialog';
import Tooltip from './components/Tooltip';
import { openFile, saveAsFile, saveToHandle } from './ui/fileIo';
import type { Ketcher } from 'ketcher-core';

const TABLE_KEY = 'chemsketcher-show-table';

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

  const toggleTable = () => {
    setShowTable((v) => {
      const next = !v;
      try {
        localStorage.setItem(TABLE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
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
      </header>

      <main className={`split ${showTable ? '' : 'solo'}`}>
        <SketchEditor showTable={showTable} onToggleTable={toggleTable} />
        {showTable && <PropertiesTable onOpenSettings={() => setSettingsOpen(true)} />}
      </main>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
