import claudeCodeIconUrl from "./claude-code.svg";
import codexIconUrl from "./codex.svg";
import qoderWorkIconUrl from "./qoderwork.svg";
import traeWorkIconUrl from "./trae-work.png";
import workBuddyIconUrl from "./workbuddy.png";

export const agentIconIds = [
  "qoderwork",
  "trae-work",
  "workbuddy",
  "codex",
  "claude-code",
] as const;

export type AgentIconId = (typeof agentIconIds)[number];

export const agentIconById = {
  qoderwork: qoderWorkIconUrl,
  "trae-work": traeWorkIconUrl,
  workbuddy: workBuddyIconUrl,
  codex: codexIconUrl,
  "claude-code": claudeCodeIconUrl,
} as const satisfies Readonly<Record<AgentIconId, string>>;

export function getAgentIcon(id: AgentIconId): string {
  return agentIconById[id];
}
