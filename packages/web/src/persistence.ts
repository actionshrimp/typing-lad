import type { StoreData } from "@typing-lad/core";

const STORAGE_KEY = "typing-lad-data";

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
