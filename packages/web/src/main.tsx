import React from "react";
import { createRoot } from "react-dom/client";
import { Store } from "@typing-lad/core";
import { loadFromLocalStorage, saveToLocalStorage } from "./persistence";
import { App } from "./components/App";
import "./index.css";

const store = new Store();
const saved = loadFromLocalStorage();
if (saved) store.loadData(saved);

// Expose store for testing
(window as any).__store = store;

const root = createRoot(document.getElementById("root")!);

function handleSave() {
  saveToLocalStorage(store.getData());
}

root.render(<App store={store} onSave={handleSave} />);
