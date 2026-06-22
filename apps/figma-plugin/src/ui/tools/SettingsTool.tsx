import { useEffect, useMemo, useState } from 'react';
import type { ExporterSettings } from '@assetport/shared';
import { Button } from '../components/Button.tsx';
import { FieldStack } from '../components/FieldStack.tsx';
import { Panel } from '../components/Panel.tsx';
import {
  DEFAULT_DIR,
  MODEL_PRESETS,
  getAvailableScalesForType,
  normalizeAssetModel,
  normalizeAssetScale,
  normalizeAssetType,
  normalizeCompressionQuality,
} from './assetExporterUtils.ts';

interface Props {
  onBack: () => void;
  exporterSettings: ExporterSettings;
  exporterSaveStatus: 'idle' | 'saving' | 'saved';
  onSaveExporterSettings: (settings: ExporterSettings) => void;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  geminiSaveStatus: 'idle' | 'saving' | 'saved';
  onSaveGeminiKey: () => void;
}

export function SettingsTool({
  onBack,
  exporterSettings,
  exporterSaveStatus,
  onSaveExporterSettings,
  geminiApiKey,
  setGeminiApiKey,
  geminiSaveStatus,
  onSaveGeminiKey,
}: Props) {
  const [exportRelativeDir, setExportRelativeDir] = useState(exporterSettings.relativeDir || DEFAULT_DIR);
  const [defaultExportType, setDefaultExportType] = useState(() => normalizeAssetType(exporterSettings.defaultType));
  const [defaultExportScale, setDefaultExportScale] = useState(() =>
    normalizeAssetScale(exporterSettings.defaultScale, exporterSettings.defaultType),
  );
  const [autoAIRename, setAutoAIRename] = useState(exporterSettings.autoAIRename === true);
  const [aiModel, setAiModel] = useState(() => normalizeAssetModel(exporterSettings.aiModel));
  const [compressionQuality, setCompressionQuality] = useState(() =>
    normalizeCompressionQuality(exporterSettings.compressionQuality),
  );

  const scaleOptions = useMemo(() => getAvailableScalesForType(defaultExportType), [defaultExportType]);
  const modelOptions = useMemo(
    () => (MODEL_PRESETS.includes(aiModel as (typeof MODEL_PRESETS)[number]) ? MODEL_PRESETS : [aiModel, ...MODEL_PRESETS]),
    [aiModel],
  );
  const hasApiKey = geminiApiKey.trim().length > 0;

  useEffect(() => {
    const nextType = normalizeAssetType(exporterSettings.defaultType);
    setExportRelativeDir(exporterSettings.relativeDir || DEFAULT_DIR);
    setDefaultExportType(nextType);
    setDefaultExportScale(normalizeAssetScale(exporterSettings.defaultScale, nextType));
    setAutoAIRename(exporterSettings.autoAIRename === true);
    setAiModel(normalizeAssetModel(exporterSettings.aiModel));
    setCompressionQuality(normalizeCompressionQuality(exporterSettings.compressionQuality));
  }, [exporterSettings]);

  // Auto rename cannot stay on without a key.
  useEffect(() => {
    if (!hasApiKey && autoAIRename) setAutoAIRename(false);
  }, [hasApiKey, autoAIRename]);

  useEffect(() => {
    if (defaultExportType === 'svg') setDefaultExportScale(1);
  }, [defaultExportType]);

  const saveStatus = geminiSaveStatus === 'saving' || exporterSaveStatus === 'saving'
    ? 'saving'
    : geminiSaveStatus === 'saved' || exporterSaveStatus === 'saved'
      ? 'saved'
      : 'idle';

  const handleSave = () => {
    onSaveGeminiKey();

    const nextDir = exportRelativeDir.trim() || DEFAULT_DIR;
    const nextType = normalizeAssetType(defaultExportType);
    const nextScale = normalizeAssetScale(defaultExportScale, nextType);
    setExportRelativeDir(nextDir);
    setDefaultExportType(nextType);
    setDefaultExportScale(nextScale);
    const nextModel = normalizeAssetModel(aiModel);
    setAiModel(nextModel);
    const nextQuality = normalizeCompressionQuality(compressionQuality);
    setCompressionQuality(nextQuality);
    onSaveExporterSettings({
      relativeDir: nextDir,
      defaultType: nextType,
      defaultScale: nextScale,
      autoAIRename: hasApiKey ? autoAIRename : false,
      aiModel: nextModel,
      compressionQuality: nextQuality,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border-none bg-transparent p-0 text-[var(--figma-color-text-secondary)] transition-colors hover:bg-[var(--figma-color-bg-secondary)] hover:text-[var(--figma-color-text)]"
          aria-label="Back to AssetPort"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 className="m-0 text-[18px] font-bold leading-[1.15]">Settings</h1>
      </div>

      <Panel>
        <div className="flex flex-col gap-3">
          <FieldStack label="Default export folder" htmlFor="asset-export-folder-settings">
            <input
              id="asset-export-folder-settings"
              type="text"
              className="w-full min-h-[34px] px-[11px] border border-[var(--figma-color-border)] rounded-[10px] bg-[color-mix(in_srgb,var(--figma-color-bg)_94%,white_2%)] outline-none text-[inherit] font-[inherit]"
              value={exportRelativeDir}
              onChange={(e) => setExportRelativeDir(e.target.value)}
              placeholder="figma-exports"
            />
          </FieldStack>
          <div className="flex gap-2.5">
            <FieldStack label="Default type" htmlFor="asset-export-type-settings" className="flex-1">
              <select
                id="asset-export-type-settings"
                className="w-full min-h-[34px] px-[11px] border border-[var(--figma-color-border)] rounded-[10px] bg-[color-mix(in_srgb,var(--figma-color-bg)_94%,white_2%)] outline-none text-[inherit] font-[inherit]"
                value={defaultExportType}
                onChange={(e) => {
                  const nextType = normalizeAssetType(e.target.value);
                  setDefaultExportType(nextType);
                  setDefaultExportScale(normalizeAssetScale(defaultExportScale, nextType));
                }}
              >
                <option value="png">png</option>
                <option value="svg">svg</option>
                <option value="jpeg">jpeg</option>
              </select>
            </FieldStack>
            <FieldStack label="Default resolution" htmlFor="asset-export-scale-settings" className="flex-1">
              <select
                id="asset-export-scale-settings"
                className="w-full min-h-[34px] px-[11px] border border-[var(--figma-color-border)] rounded-[10px] bg-[color-mix(in_srgb,var(--figma-color-bg)_94%,white_2%)] outline-none text-[inherit] font-[inherit]"
                value={defaultExportScale}
                onChange={(e) => setDefaultExportScale(Number(e.target.value) as 1 | 2 | 3 | 4)}
              >
                {scaleOptions.map((scale) => (
                  <option key={scale} value={scale}>{scale}x</option>
                ))}
              </select>
            </FieldStack>
          </div>
          <FieldStack
            label={`Compression quality (${compressionQuality === 100 ? 'lossless' : compressionQuality})`}
            htmlFor="asset-compression-quality-settings"
          >
            <input
              id="asset-compression-quality-settings"
              type="range"
              min={0}
              max={100}
              step={1}
              className="w-full accent-[var(--figma-color-border-selected)]"
              value={compressionQuality}
              onChange={(e) => setCompressionQuality(normalizeCompressionQuality(e.target.value))}
            />
            <div className="flex justify-between text-[10px] leading-none text-[var(--figma-color-text-secondary)]">
              <span>Smaller files</span>
              <span>Higher quality</span>
            </div>
          </FieldStack>
          <FieldStack label="Gemini API key" htmlFor="gemini-api-key-settings">
            <input
              id="gemini-api-key-settings"
              type="password"
              className="w-full min-h-[34px] px-[11px] border border-[var(--figma-color-border)] rounded-[10px] bg-[color-mix(in_srgb,var(--figma-color-bg)_94%,white_2%)] outline-none text-[inherit] font-[inherit]"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder="Enables AI rename"
            />
          </FieldStack>
          <FieldStack label="AI model" htmlFor="ai-model-settings">
            <select
              id="ai-model-settings"
              className="w-full min-h-[34px] px-[11px] border border-[var(--figma-color-border)] rounded-[10px] bg-[color-mix(in_srgb,var(--figma-color-bg)_94%,white_2%)] outline-none text-[inherit] font-[inherit]"
              value={aiModel}
              onChange={(e) => setAiModel(normalizeAssetModel(e.target.value))}
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </FieldStack>
          <FieldStack label="Auto AI rename" htmlFor="auto-ai-rename-settings" orientation="horizontal">
            <label className={`relative inline-flex items-center ${hasApiKey ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
              <input
                id="auto-ai-rename-settings"
                type="checkbox"
                className="peer sr-only"
                checked={autoAIRename}
                disabled={!hasApiKey}
                onChange={(e) => setAutoAIRename(e.target.checked)}
              />
              <div className="peer-checked:bg-[var(--figma-color-border-selected)] h-[18px] w-[32px] rounded-full bg-[var(--figma-color-border)] transition-colors peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--figma-color-border-selected)] after:absolute after:left-[1px] after:top-[1px] after:h-[16px] after:w-[16px] after:rounded-full after:bg-white after:transition-transform after:content-[''] peer-checked:after:translate-x-[14px]"></div>
            </label>
          </FieldStack>
          <p className="m-0 text-[10px] leading-[1.4] text-[var(--figma-color-text-secondary)]">
            {hasApiKey
              ? 'Auto AI rename names assets on add using the model above. PNG/JPEG exports are compressed to the quality above (100 = lossless); SVGs are never compressed. The folder is relative to your open VS Code workspace; SVG exports are fixed to 1x.'
              : 'Add a Gemini API key to enable AI rename. PNG/JPEG exports are compressed to the quality above (100 = lossless); SVGs are never compressed. The folder is relative to your open VS Code workspace; SVG exports are fixed to 1x.'}
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={handleSave} disabled={saveStatus === 'saving'}>
              {saveStatus === 'saved' ? '✓ Saved!' : saveStatus === 'saving' ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
