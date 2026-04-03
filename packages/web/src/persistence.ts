import type { StoreData } from "@typing-lad/core";

const STORAGE_KEY = "typing-lad-data";
const IDB_NAME = "typing-lad";
const IDB_STORE = "file-handles";
const HANDLE_KEY = "sync-file";

// ── localStorage (always available) ──

export function saveToLocalStorage(data: StoreData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadFromLocalStorage(): StoreData | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoreData;
  } catch {
    return null;
  }
}

// ── File System Access API (Chrome) — auto-sync ──

function hasFileSystemAccess(): boolean {
  return "showSaveFilePicker" in window && "showOpenFilePicker" in window;
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeHandle(handle: FileSystemFileHandle): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function getStoredHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(HANDLE_KEY);
      req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
      req.onerror = () => { db.close(); resolve(null); };
    });
  } catch {
    return null;
  }
}

async function clearStoredHandle(): Promise<void> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(HANDLE_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch { /* ignore */ }
}

async function verifyPermission(handle: FileSystemFileHandle, write: boolean): Promise<boolean> {
  const opts: any = { mode: write ? "readwrite" : "read" };
  if (await (handle as any).queryPermission(opts) === "granted") return true;
  if (await (handle as any).requestPermission(opts) === "granted") return true;
  return false;
}

/** Try to reconnect to a previously chosen sync file. Returns the handle if successful. */
export async function tryRestoreFileSync(): Promise<FileSystemFileHandle | null> {
  if (!hasFileSystemAccess()) return null;
  const handle = await getStoredHandle();
  if (!handle) return null;
  try {
    // Just check read permission — don't prompt yet (that needs user gesture)
    if (await (handle as any).queryPermission({ mode: "readwrite" }) === "granted") {
      return handle;
    }
  } catch { /* stale handle */ }
  return null;
}

/** Prompt user to re-grant permission on a stored handle (needs user gesture). */
export async function requestFileSyncPermission(): Promise<FileSystemFileHandle | null> {
  if (!hasFileSystemAccess()) return null;
  const handle = await getStoredHandle();
  if (!handle) return null;
  try {
    if (await verifyPermission(handle, true)) return handle;
  } catch { /* denied */ }
  return null;
}

/** Prompt user to pick a file for sync. Returns the handle. */
export async function enableFileSync(): Promise<FileSystemFileHandle | null> {
  if (!hasFileSystemAccess()) return null;
  try {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: "typing-lad-data.json",
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
    });
    await storeHandle(handle);
    return handle;
  } catch {
    return null; // user cancelled
  }
}

/** Disconnect file sync. */
export async function disableFileSync(): Promise<void> {
  await clearStoredHandle();
}

/** Write data to the synced file. */
export async function saveToFile(handle: FileSystemFileHandle, data: StoreData): Promise<boolean> {
  try {
    if (!await verifyPermission(handle, true)) return false;
    const writable = await (handle as any).createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

/** Read data from the synced file. */
export async function loadFromFile(handle: FileSystemFileHandle): Promise<StoreData | null> {
  try {
    if (!await verifyPermission(handle, false)) return null;
    const file = await handle.getFile();
    const text = await file.text();
    return JSON.parse(text) as StoreData;
  } catch {
    return null;
  }
}

/** Check if File System Access API is available (Chrome/Edge). */
export { hasFileSystemAccess };

// ── Manual export/import (all browsers) ──

export async function exportToFile(data: StoreData): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  if ("showSaveFilePicker" in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: "typing-lad-data.json",
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return;
    } catch { /* user cancelled or API unavailable */ }
  }
  // Fallback: blob download
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "typing-lad-data.json";
  a.click();
  URL.revokeObjectURL(url);
}

export async function importFromFile(): Promise<StoreData | null> {
  if ("showOpenFilePicker" in window) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
      const file = await handle.getFile();
      const text = await file.text();
      return JSON.parse(text) as StoreData;
    } catch { return null; }
  }
  // Fallback: input element
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const text = await file.text();
      try { resolve(JSON.parse(text) as StoreData); }
      catch { resolve(null); }
    };
    input.click();
  });
}
