# AssetPort

![AssetPort Logo](logo.png)

Export Figma assets directly to your VS Code workspace.

This repository is a pnpm monorepo with two parts that work together:

- **`apps/vscode`** — VS Code extension that runs a local HTTP server on `http://localhost:32123`
- **`apps/figma-plugin`** — Figma plugin that exports the current selection as PNG/SVG/JPEG and sends it to that server

The extension is the server. The Figma plugin is the client.

---

## Features

- **Multi-format export** — Export selected Figma layers as PNG, SVG, or JPEG directly into your VS Code workspace.
- **Asset queue** — Stage multiple layers at once and export them all in a single action.
- **Live preview** — Preview each queued asset at 1×, 2×, 3×, or 4× before committing to export.
- **AI-powered naming** — Optionally auto-rename assets using Gemini based on the visual content of each layer.
- **Configurable output folder** — Set a custom relative path for each export session (e.g. `src/assets/icons`).
- **Duplicate guard** — Adding the same Figma node twice to the queue is blocked automatically.
- **Lossy compression** — PNG and JPEG exports run through configurable quality compression (0–100). SVG is always exported losslessly.
- **Fully local** — No cloud relay. The plugin talks directly to a local HTTP server in your VS Code extension.

---

## Roadmap

- **SVG as React component** — Export SVG layers as `.jsx` / `.tsx` files with the SVG inlined as a React component.
- **SVG as Vue component** — Same as above but wrapped in a `.vue` single-file component.
- **Workspace collision detection** — Before writing a file, check whether a file with the same name and path already exists in the workspace and prompt the user to overwrite, rename, or skip.
- **Per-node ignore list** — Mark specific child layers or nodes to be excluded from an export (e.g. strip annotation layers or placeholder content).

---

## Prerequisites

- [Node.js](https://nodejs.org) (v20+)
- [pnpm](https://pnpm.io) v10+

---

## Develop

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start the VS Code extension

Open this folder in VS Code and press **F5** to launch an Extension Development Host.

In the new window, click the **AssetPort** icon in the activity bar to confirm the export server is running.

### 3. Start the Figma plugin (dev mode)

```bash
pnpm dev:plugin
```

### 4. Load the plugin in Figma

In the Figma desktop app, go to **Plugins > Development > Import plugin from manifest** and select `apps/figma-plugin/dist/manifest.json`.

---

## Build

```bash
pnpm build
```

This builds both the Figma plugin and the VS Code extension.

---

## Package

```bash
# Package the VS Code extension as a .vsix file (current platform)
pnpm package:vscode

# Package for all platforms
pnpm package:vscode:all
```

---

## Install

### VS Code extension

1. Run `pnpm package:vscode` to produce a `.vsix` file.
2. In VS Code, run **Extensions: Install from VSIX** and select the `.vsix` file.

### Figma plugin

1. Build the plugin:
   ```bash
   pnpm build
   ```
2. In the Figma desktop app, go to **Plugins > Development > Import plugin from manifest** and select `apps/figma-plugin/dist/manifest.json`.

---

## Use

1. Make sure the VS Code extension is running (click the **AssetPort** icon in the activity bar).
2. In Figma, select one or more layers and run the plugin.
3. Choose an output folder (e.g. `assets/figma`) and export format (PNG, SVG, or JPEG).
4. The file is saved inside the first workspace folder open in VS Code.

### Settings

| Setting                        | Default | Description                                                                                                  |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------ |
| `assetport.geminiApiKey`       | `""`    | Gemini API key for AI-powered asset naming in the Figma plugin                                               |
| `assetport.compressionQuality` | `75`    | Quality target (0–100) for lossy PNG/JPEG compression. `100` keeps PNGs lossless. SVGs are never compressed. |

---

## Demo

https://github.com/user-attachments/assets/3e10cea8-d1d3-4ab2-a74c-36342a0008f6
