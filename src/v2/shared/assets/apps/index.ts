import type { SupportedAppId } from "../../features/types";
import claudeIconUrl from "../agents/claude-code.svg";
import codexIconUrl from "../agents/codex.svg";
import geminiIconUrl from "./gemini.svg";
import grokBuildIconUrl from "./grokbuild.svg";
import hermesIconUrl from "./hermes.png";
import openCodeIconUrl from "./opencode.svg";

export const supportedAppIconById: Record<SupportedAppId, string> = {
  claude: claudeIconUrl,
  codex: codexIconUrl,
  gemini: geminiIconUrl,
  grokbuild: grokBuildIconUrl,
  opencode: openCodeIconUrl,
  hermes: hermesIconUrl,
};

export function getSupportedAppIcon(id: SupportedAppId): string {
  return supportedAppIconById[id];
}
