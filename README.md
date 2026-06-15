# Figma Sidebar Viewer

This is a minimal VS Code extension that adds:

- A sidebar view in the Activity Bar
- A command that opens a center webview panel
- An embedded attempt to load `https://www.figma.com`

## Run locally

1. Open this folder in VS Code.
2. Run `npm install`.
3. Press `F5` to launch an Extension Development Host.
4. In the new window, click the **Figma** activity bar icon.
5. Run `Figma: Open Center View` from the Command Palette.

## Important note

Figma may block loading inside a VS Code webview iframe. If that happens, the panel will stay blank and you should open Figma in an external browser instead.
