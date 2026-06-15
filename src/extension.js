const vscode = require("vscode");

function activate(context) {
  const sidebarProvider = new FigmaSidebarProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      FigmaSidebarProvider.viewType,
      sidebarProvider,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("figma.openCenterView", () => {
      const panel = vscode.window.createWebviewPanel(
        "figmaCenterView",
        "Figma",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
        },
      );

      panel.webview.html = getCenterWebviewHtml();
    }),
  );
}

class FigmaSidebarProvider {
  static viewType = "figmaSidebarView";

  constructor(extensionUri) {
    this.extensionUri = extensionUri;
  }

  resolveWebviewView(webviewView) {
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.type === "openCenterView") {
        vscode.commands.executeCommand("figma.openCenterView");
      }
    });

    webviewView.webview.html = getSidebarHtml();
  }
}

function getSidebarHtml() {
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        body {
          font-family: var(--vscode-font-family);
          padding: 16px;
          color: var(--vscode-foreground);
        }

        .card {
          border: 1px solid var(--vscode-panel-border);
          border-radius: 10px;
          padding: 14px;
          background: var(--vscode-sideBar-background);
        }

        h2 {
          margin-top: 0;
        }

        p {
          line-height: 1.45;
        }

        button {
          width: 100%;
          border: 0;
          border-radius: 8px;
          padding: 10px 12px;
          cursor: pointer;
          color: var(--vscode-button-foreground);
          background: var(--vscode-button-background);
        }

        button:hover {
          background: var(--vscode-button-hoverBackground);
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>Figma</h2>
        <p>Use the command palette and run <strong>Figma: Open Center View</strong> to open the main panel.</p>
        <button onclick="openCenterView()">Open Center View</button>
      </div>

      <script>
        const vscode = acquireVsCodeApi();

        function openCenterView() {
          vscode.postMessage({ type: "openCenterView" });
        }
      </script>
    </body>
  </html>`;
}

function getCenterWebviewHtml() {
  return `<!DOCTYPE html>`;
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
