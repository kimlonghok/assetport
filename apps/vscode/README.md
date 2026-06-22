# AssetPort

Export Figma assets directly to your VS Code workspace — no cloud relay, fully local.

## How it works

The extension runs a local HTTP server on `http://localhost:32123`. The companion [Figma plugin](https://github.com/kimlonghok/assetport) sends selected layers to that server, which writes the files directly into your open workspace folder.

## Features

- **Multi-format export** — Export selected Figma layers as PNG, SVG, or JPEG.
- **Asset queue** — Stage multiple layers and export them all in one action.
- **Live preview** — Preview each queued asset at 1×, 2×, 3×, or 4× before exporting.
- **AI-powered naming** — Optionally auto-rename assets using Gemini based on visual content.
- **Configurable output folder** — Set a custom relative path per session (e.g. `src/assets/icons`).
- **Lossy compression** — PNG and JPEG exports are compressed with configurable quality (0–100). SVG is always lossless.
- **Fully local** — No cloud relay. Your assets never leave your machine.

## Getting started

1. Install this extension.
2. Open a folder in VS Code.
3. The export server starts automatically (look for **AssetPort** in the status bar).
4. Install the companion Figma plugin and select layers to export.

## Settings

| Setting                        | Default | Description                                                                                             |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------- |
| `assetport.geminiApiKey`       | `""`    | Gemini API key for AI-powered asset naming                                                              |
| `assetport.compressionQuality` | `75`    | Compression quality (0–100) for PNG/JPEG exports. `100` keeps PNGs lossless. SVGs are never compressed. |

## Commands

| Command                          | Description                     |
| -------------------------------- | ------------------------------- |
| `assetport: Start Export Server` | Manually start the local server |
| `assetport: Stop Export Server`  | Stop the local server           |

## License

MIT
