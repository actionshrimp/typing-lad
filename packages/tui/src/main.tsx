import React from "react";
import { render } from "ink";
import { Store, Engine } from "@typing-lad/core";
import { loadData, saveData, getDefaultDataPath } from "./persistence.js";
import { App } from "./components/App.js";

const dataPath = process.env.TYPING_LAD_DATA_PATH || getDefaultDataPath();
const store = new Store();
const saved = loadData(dataPath);
if (saved) store.loadData(saved);
const engine = new Engine(store);

render(
  <App
    store={store}
    engine={engine}
    onSave={() => saveData(dataPath, store.getData())}
  />
);
