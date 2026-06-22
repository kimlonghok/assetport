import * as http from 'http';
import * as path from 'path';
import * as vscode from 'vscode';
import { compressJpeg, losslessCompressPng, pngQuantize } from '@napi-rs/image';
import type { AssetFormat, ExportRequest, ExportResponse, HealthResponse, SettingsResponse } from '@assetport/shared';

const SERVER_HOST = 'localhost';
const SERVER_PORT = 32123;
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function activate(context: vscode.ExtensionContext): void {
  const server = new AssetPortServer();
  const statusBar = new AssetPortStatusBar(server);

  context.subscriptions.push(server, statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand('assetport.startServer', () => {
      server.start().catch((error: Error) => {
        vscode.window.showErrorMessage(`AssetPort: Failed to start — ${error.message}`);
      });
    }),
    vscode.commands.registerCommand('assetport.stopServer', () => {
      server.stop();
    }),
  );

}

export function deactivate(): void {}

class AssetPortStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor(private readonly server: AssetPortServer) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'assetport.toggleServer';
    this.render();
    this.item.show();

    server.onStatusChange(() => this.render());

    vscode.commands.registerCommand('assetport.toggleServer', () => {
      if (server.isRunning()) {
        server.stop();
      } else {
        server.start().catch((error: Error) => {
          vscode.window.showErrorMessage(`AssetPort: Failed to start — ${error.message}`);
        });
      }
    });
  }

  private render(): void {
    if (this.server.isRunning()) {
      this.item.text = '$(circle-slash) assetport';
      this.item.tooltip = 'assetport is running';
    } else {
      this.item.text = '$(zap) assetport';
      this.item.tooltip = 'assetport is not running';
    }
    this.item.backgroundColor = undefined;
    this.item.color = undefined;
  }

  dispose(): void {
    this.item.dispose();
  }
}

class AssetPortServer implements vscode.Disposable {
  private server: http.Server | undefined;
  private readonly statusListeners = new Set<() => void>();

  onStatusChange(listener: () => void): void {
    this.statusListeners.add(listener);
  }

  private emitStatusChange(): void {
    for (const listener of this.statusListeners) {
      listener();
    }
  }

  isRunning(): boolean {
    return Boolean(this.server?.listening);
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = http.createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (error) {
        res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
    });

    this.server.on('error', (error: Error) => {
      vscode.window.showErrorMessage(`AssetPort server error: ${error.message}`);
      this.emitStatusChange();
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(SERVER_PORT, SERVER_HOST, () => {
        this.emitStatusChange();
        resolve();
      });
      this.server!.once('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.server!.close(() => {
        this.server = undefined;
        this.emitStatusChange();
        resolve();
      });
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      const body: HealthResponse = { ok: true, host: SERVER_HOST, port: SERVER_PORT };
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }

    if (req.method === 'GET' && req.url === '/settings') {
      const geminiApiKey = vscode.workspace.getConfiguration('assetport').get<string>('geminiApiKey', '');
      const body: SettingsResponse = { geminiApiKey };
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }

    if (req.method === 'GET' && req.url === '/workspace') {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const workspaceRoot = workspaceFolder?.uri.fsPath ?? null;
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ workspaceRoot }));
      return;
    }

    if (req.method !== 'POST' || req.url !== '/export') {
      res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const body = await readJsonBody<ExportRequest>(req);
    const result = await saveExportedAsset(body);
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  }

  dispose(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
      this.emitStatusChange();
    }
  }
}

async function readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

async function saveExportedAsset(payload: ExportRequest): Promise<ExportResponse> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    throw new Error('Open a folder in VS Code before exporting from Figma.');
  }

  const fileName = sanitizeFileName(payload.fileName ?? 'figma-asset');
  const extension = sanitizeExtension(payload.extension ?? 'png');
  const relativeDir = typeof payload.relativeDir === 'string' ? payload.relativeDir.trim() : 'figma-exports';
  const base64Data = payload.base64Data;

  if (!base64Data) {
    throw new Error('Missing asset data.');
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  const targetDirectory = resolveInsideWorkspace(workspaceRoot, relativeDir);
  const targetFile = resolveInsideWorkspace(targetDirectory, `${fileName}.${extension}`);

  const original = Buffer.from(base64Data, 'base64');
  // The Figma plugin sends its own quality per export; fall back to the VS Code setting when absent.
  const configQuality = vscode.workspace.getConfiguration('assetport').get<number>('compressionQuality', 75);
  const quality = Number.isFinite(payload.compressionQuality as number)
    ? (payload.compressionQuality as number)
    : configQuality;
  const output = await compressAsset(original, payload.extension, quality);

  await vscode.workspace.fs.createDirectory(vscode.Uri.file(targetDirectory));
  await vscode.workspace.fs.writeFile(vscode.Uri.file(targetFile), output);

  const relativePath = path.relative(workspaceRoot, targetFile);
  const bytes = output.length;

  vscode.window.setStatusBarMessage(`AssetPort: saved ${relativePath}`, 4000);

  return { ok: true, relativePath, bytes };
}

async function compressAsset(input: Buffer, format: AssetFormat, quality: number): Promise<Buffer> {
  // SVG is vector — the raster compressor can't touch it. Unknown formats pass through too.
  if (format !== 'png' && format !== 'jpeg') {
    return input;
  }

  const clamped = Math.min(100, Math.max(0, Math.round(quality)));

  try {
    let compressed: Buffer;
    if (format === 'png') {
      // TinyPNG does two things: palette quantization AND an optimal lossless re-encode.
      // imagequant (pngQuantize) only does the first and writes with a basic encoder, so we
      // always finish with oxipng (losslessCompressPng) to recode IDAT with the best filters/
      // DEFLATE and strip metadata. That second pass is the ~10-20% TinyPNG saves on top.
      // quality 100 → skip quantization (keep pixels exact); below → quantize first.
      const quantized =
        clamped >= 100
          ? input
          : // minQuality 0 → best-effort; without it the quantizer throws QUALITY_TOO_LOW on busy images.
            await pngQuantize(input, { minQuality: 0, maxQuality: clamped });
      compressed = await losslessCompressPng(quantized, { strip: true });
    } else {
      // mozjpeg: optimizeScans defaults true; it already strips metadata.
      compressed = await compressJpeg(input, { quality: clamped });
    }

    // Never let compression bloat an asset — quantizing an already-optimized or tiny
    // image can produce a larger file. Keep whichever is smaller.
    return compressed.length < input.length ? compressed : input;
  } catch (error) {
    // Best-effort: a decode/encode failure must not break the export.
    vscode.window.setStatusBarMessage(`AssetPort: compression skipped — ${(error as Error).message}`, 4000);
    return input;
  }
}

function sanitizeFileName(value: string): string {
  return (
    String(value)
      .trim()
      .replace(/[<>:"/\\|?* -]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'figma-asset'
  );
}

function sanitizeExtension(value: string): string {
  return String(value).trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'png';
}

function resolveInsideWorkspace(rootPath: string, requestedPath: string): string {
  const resolvedPath = path.resolve(rootPath, requestedPath);
  const relativePath = path.relative(rootPath, resolvedPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Export path must stay inside the open workspace folder.');
  }

  return resolvedPath;
}
