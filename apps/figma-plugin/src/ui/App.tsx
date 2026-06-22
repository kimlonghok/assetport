import { useEffect, useRef, useState } from 'react';
import type { ExporterSettings, MainToUiMessage } from '@assetport/shared';
import { SettingsTool } from './tools/SettingsTool.tsx';
import { AssetExporterTool } from './tools/AssetExporterTool.tsx';
import {
  DEFAULT_COMPRESSION_QUALITY,
  DEFAULT_DIR,
  DEFAULT_MODEL,
  DEFAULT_SCALE,
  DEFAULT_TYPE,
  normalizeAssetModel,
  normalizeAssetScale,
  normalizeAssetType,
  normalizeCompressionQuality,
} from './tools/assetExporterUtils.ts';

type ViewId = 'asset-exporter' | 'settings';

function App() {
  const [view, setView] = useState<ViewId>('asset-exporter');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const geminiApiKeyRef = useRef('');
  const [geminiSaveStatus, setGeminiSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [exporterSettings, setExporterSettings] = useState<ExporterSettings>({
    relativeDir: DEFAULT_DIR,
    defaultType: DEFAULT_TYPE,
    defaultScale: DEFAULT_SCALE,
    autoAIRename: false,
    aiModel: DEFAULT_MODEL,
    compressionQuality: DEFAULT_COMPRESSION_QUALITY,
  });
  const [exporterSaveStatus, setExporterSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    window.parent.postMessage({ pluginMessage: { type: 'load-gemini-key' } }, '*');
    window.parent.postMessage({ pluginMessage: { type: 'load-exporter-settings' } }, '*');
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<{ pluginMessage?: MainToUiMessage }>) => {
      const message = event.data?.pluginMessage;
      if (!message) return;

      if (message.type === 'gemini-key-loaded') {
        const nextKey = message.apiKey || '';
        setGeminiApiKey(nextKey);
        geminiApiKeyRef.current = nextKey;
        return;
      }

      if (message.type === 'gemini-key-saved') {
        setGeminiSaveStatus('saved');
        window.setTimeout(() => setGeminiSaveStatus('idle'), 2000);
        return;
      }

      if (message.type === 'exporter-settings-loaded' || message.type === 'exporter-settings-saved') {
        const s = message.settings ?? ({} as ExporterSettings);
        const defaultType = normalizeAssetType(s.defaultType);
        setExporterSettings({
          relativeDir: typeof s.relativeDir === 'string' && s.relativeDir.trim() ? s.relativeDir.trim() : DEFAULT_DIR,
          defaultType,
          defaultScale: normalizeAssetScale(s.defaultScale, defaultType),
          autoAIRename: s.autoAIRename === true,
          aiModel: normalizeAssetModel(s.aiModel),
          compressionQuality: normalizeCompressionQuality(s.compressionQuality),
        });

        if (message.type === 'exporter-settings-saved') {
          setExporterSaveStatus('saved');
          window.setTimeout(() => setExporterSaveStatus('idle'), 2000);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSaveGeminiKey = () => {
    const trimmedKey = geminiApiKey.trim();
    geminiApiKeyRef.current = trimmedKey;
    setGeminiSaveStatus('saving');
    window.parent.postMessage({ pluginMessage: { type: 'save-gemini-key', apiKey: trimmedKey } }, '*');
  };

  const handleSaveExporterSettings = (settings: ExporterSettings) => {
    const defaultType = normalizeAssetType(settings.defaultType);
    const nextSettings: ExporterSettings = {
      relativeDir: typeof settings.relativeDir === 'string' && settings.relativeDir.trim()
        ? settings.relativeDir.trim()
        : DEFAULT_DIR,
      defaultType,
      defaultScale: normalizeAssetScale(settings.defaultScale, defaultType),
      autoAIRename: settings.autoAIRename === true,
      aiModel: normalizeAssetModel(settings.aiModel),
      compressionQuality: normalizeCompressionQuality(settings.compressionQuality),
    };

    setExporterSettings(nextSettings);
    setExporterSaveStatus('saving');
    window.parent.postMessage({ pluginMessage: { type: 'save-exporter-settings', settings: nextSettings } }, '*');
  };

  const settingsProps = {
    onBack: () => setView('asset-exporter'),
    geminiApiKey,
    setGeminiApiKey,
    geminiSaveStatus,
    onSaveGeminiKey: handleSaveGeminiKey,
    exporterSettings,
    exporterSaveStatus,
    onSaveExporterSettings: handleSaveExporterSettings,
  };

  return (
    <div className="min-h-screen p-[14px]">
      <div className="flex flex-col gap-3">
        {view === 'settings' && <SettingsTool {...settingsProps} />}
        {/* Keep the exporter mounted so its in-progress asset list survives a trip to Settings. */}
        <div className={view === 'settings' ? 'hidden' : 'contents'}>
          <AssetExporterTool
            onOpenSettings={() => setView('settings')}
            geminiApiKey={geminiApiKey}
            exporterSettings={exporterSettings}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
