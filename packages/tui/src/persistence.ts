import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { StoreData } from "@typing-lad/core";

export function getDefaultDataPath(): string {
  return path.join(os.homedir(), ".config", "typing-lad", "data.json");
}

export function loadData(filePath: string): StoreData | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as StoreData;
  } catch {
    return null;
  }
}

export function saveData(filePath: string, data: StoreData): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}
