import React from "react";
import { createRoot } from "react-dom/client";
import { Store } from "@typing-lad/core";
import {
  loadFromLocalStorage,
  saveToLocalStorage,
  tryRestoreFileSync,
  loadFromFile,
} from "./persistence";
import { App } from "./components/App";
import "./index.css";

const store = new Store();
const saved = loadFromLocalStorage();
if (saved) store.loadData(saved);

// Expose store for testing
(window as any).__store = store;

const root = createRoot(document.getElementById("root")!);

// Try to restore file sync and load fresher data from the synced file
async function init() {
  const handle = await tryRestoreFileSync();
  if (handle) {
    const fileData = await loadFromFile(handle);
    if (fileData) {
      store.loadData(fileData);
      saveToLocalStorage(fileData);
    }
  }

  function handleSave() {
    saveToLocalStorage(store.getData());
  }

  root.render(
    <App
      store={store}
      onSave={handleSave}
      initialFileHandle={handle}
    />
  );
}

init();
