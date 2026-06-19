


# Figma to VS Code Export

This repository has two parts that work together:

- A **VS Code extension** that runs a local HTTP server on `http://localhost:32123`
- A **Figma plugin** that exports the current selection as a PNG/SVG and sends it to that server

The extension is the server. The Figma plugin is the client.

---

## Develop

### 1. Install dependencies

```bash
npm install
cd figma-plugin && npm install
```

### 2. Start the VS Code extension

Open this folder in VS Code and press **F5** to launch an Extension Development Host.

In the new window, click the **Figma** icon in the activity bar to confirm the export server is running.

### 3. Start the Figma plugin (dev mode)

```bash
cd figma-plugin
npm run dev
```

### 4. Load the plugin in Figma

In the Figma desktop app, go to **Plugins > Development > Import plugin from manifest** and select `figma-plugin/dist/manifest.json`.

---

## Build

> Prerequisites: run `npm install` and `cd figma-plugin && npm install` first.

```bash
npm run build      # build the figma-plugin only
npm run package    # build + package the VS Code extension as a .vsix file
```

---

## Install

### VS Code extension

1. Run `npm run package` to produce a `.vsix` file.
2. In VS Code, run **Extensions: Install from VSIX** and select the `.vsix` file.

### Figma plugin

1. Build the plugin first:
   ```bash
   cd figma-plugin && npm run build
   ```
2. Open `figma-plugin/dist/manifest.json` in the Figma desktop app via **Plugins > Development > Import plugin from manifest**.

---

## Use

1. Make sure the VS Code extension is running (click the **Figma** icon in the activity bar).
2. In Figma, select a layer and run the plugin.
3. Choose an output folder (e.g. `assets/figma`) and export.
4. The file is saved inside the first workspace folder open in VS Code.

## Demo

https://github.com/user-attachments/assets/3e10cea8-d1d3-4ab2-a74c-36342a0008f6


