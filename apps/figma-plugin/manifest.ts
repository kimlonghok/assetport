import { defineManifest } from "plugma";
export default defineManifest({
  id: "1650765417453504141",
  name: "assetport",
  api: "1.0.0",
  documentAccess: "dynamic-page",
  main: "src/main/main.ts",
  ui: "src/ui/ui.tsx",
  editorType: ["figma", "figjam"],
  networkAccess: {
    allowedDomains: [
      "http://localhost:32123/",
      "https://generativelanguage.googleapis.com/",
    ],
    devAllowedDomains: [
      "http://localhost:32123/",
      "https://generativelanguage.googleapis.com/",
    ],
    reasoning:
      "The plugin needs localhost access for the VS Code export server and Gemini API access for AI asset renaming.",
  },
});
