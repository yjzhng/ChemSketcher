/**
 * Save / open a structure file. Uses the File System Access API (native
 * Save-As / Open dialogs — available in Electron's Chromium) with graceful
 * fallbacks (anchor download / hidden file input) for browsers that lack it.
 *
 * A file "handle" is threaded through so Save can write back to the current
 * file silently, while Save As always prompts for a new location.
 */

const STRUCTURE_EXTS = [
  '.mol',
  '.sdf',
  '.ket',
  '.smi',
  '.smiles',
  '.rxn',
  '.cxsmiles',
  '.mrv',
];

interface WindowFS {
  showSaveFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle[]>;
}

// queryPermission/requestPermission aren't in the standard lib types yet.
type HandleWithPerms = FileSystemFileHandle & {
  queryPermission?: (o: { mode: string }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: string }) => Promise<PermissionState>;
};

export interface SavedFile {
  /** null when saved via the download fallback (no persistent handle). */
  handle: FileSystemFileHandle | null;
  name: string;
}

async function writeHandle(handle: FileSystemFileHandle, content: string): Promise<void> {
  const stream = await handle.createWritable();
  await stream.write(content);
  await stream.close();
}

async function ensureWritable(handle: FileSystemFileHandle): Promise<boolean> {
  const h = handle as HandleWithPerms;
  if (!h.queryPermission) return true; // no permission API — assume writable
  const opts = { mode: 'readwrite' };
  if ((await h.queryPermission(opts)) === 'granted') return true;
  return (await h.requestPermission?.(opts)) === 'granted';
}

/** Save As: always prompt for a location. Returns null if the user cancels. */
export async function saveAsFile(
  suggestedName: string,
  content: string,
): Promise<SavedFile | null> {
  const w = window as unknown as WindowFS;
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName,
        types: [
          { description: 'Chemical structure', accept: { 'chemical/x-mdl-molfile': ['.mol'] } },
        ],
      });
      await writeHandle(handle, content);
      return { handle, name: handle.name };
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return null;
      throw e;
    }
  }
  downloadFallback(suggestedName, content);
  return { handle: null, name: suggestedName };
}

/** Save: write to an existing handle silently. False → no handle/permission,
 *  so the caller should fall back to Save As. */
export async function saveToHandle(
  handle: FileSystemFileHandle | null,
  content: string,
): Promise<boolean> {
  if (!handle || !(await ensureWritable(handle))) return false;
  await writeHandle(handle, content);
  return true;
}

/** Open a structure file. Returns its text + name + handle, or null if cancelled. */
export async function openFile(): Promise<
  { text: string; name: string; handle: FileSystemFileHandle | null } | null
> {
  const w = window as unknown as WindowFS;
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'Structure files', accept: { 'chemical/*': STRUCTURE_EXTS } }],
      });
      const file = await handle.getFile();
      return { text: await file.text(), name: file.name, handle };
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return null;
      throw e;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = STRUCTURE_EXTS.join(',');
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { text: await f.text(), name: f.name, handle: null } : null);
    };
    input.click();
  });
}

function downloadFallback(name: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
