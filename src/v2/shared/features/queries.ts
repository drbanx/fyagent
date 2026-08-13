import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useFeatures } from "./provider";
import type { ProviderAppId } from "./types";

export const featureKeys = {
  agentCatalog: ["v2", "agents", "catalog"] as const,
  providerSummary: (app: ProviderAppId) =>
    ["v2", "providers", app, "summary"] as const,
  workbuddyStatus: ["v2", "workbuddy", "status"] as const,
  workbuddyModelIds: ["v2", "workbuddy", "model-ids"] as const,
  skills: ["v2", "skills", "installed"] as const,
  skillBackups: ["v2", "skills", "backups"] as const,
  skillRepos: ["v2", "skills", "repos"] as const,
  skillDiscovery: ["v2", "skills", "discovery"] as const,
  skillUnmanaged: ["v2", "skills", "unmanaged"] as const,
  skillUpdates: ["v2", "skills", "updates"] as const,
  mcp: ["v2", "mcp"] as const,
  settings: ["v2", "settings"] as const,
};

export function useAgentCatalog(enabled = true) {
  const { ports } = useFeatures();
  return useQuery({
    queryKey: featureKeys.agentCatalog,
    queryFn: ports.catalog.get,
    enabled,
  });
}

export function useProviderSummary(app: ProviderAppId, enabled = true) {
  const { ports } = useFeatures();
  return useQuery({
    queryKey: featureKeys.providerSummary(app),
    queryFn: () => ports.providers.getSummary(app),
    enabled,
  });
}

export function useWorkBuddyStatus(enabled = true) {
  const { ports } = useFeatures();
  return useQuery({
    queryKey: featureKeys.workbuddyStatus,
    queryFn: ports.workbuddy.getStatus,
    enabled,
  });
}

export function useWorkBuddyModelIds(enabled = true) {
  const { ports } = useFeatures();
  return useQuery({
    queryKey: featureKeys.workbuddyModelIds,
    queryFn: ports.workbuddy.getModelIds,
    enabled,
  });
}

export function useInstalledSkills() {
  const { ports } = useFeatures();
  return useQuery({
    queryKey: featureKeys.skills,
    queryFn: ports.skills.getInstalled,
  });
}
export function useSkillBackups(enabled = true) {
  const { ports } = useFeatures();
  return useQuery({
    queryKey: featureKeys.skillBackups,
    queryFn: ports.skills.getBackups,
    enabled,
  });
}
export function useSkillRepos() {
  const { ports } = useFeatures();
  return useQuery({
    queryKey: featureKeys.skillRepos,
    queryFn: ports.skills.getRepos,
  });
}
export function useSkillDiscovery() {
  const { ports } = useFeatures();
  return useQuery({
    queryKey: featureKeys.skillDiscovery,
    queryFn: ports.skills.discover,
  });
}
export function useUnmanagedSkills(enabled = false) {
  const { ports } = useFeatures();
  return useQuery({
    queryKey: featureKeys.skillUnmanaged,
    queryFn: ports.skills.scanUnmanaged,
    enabled,
  });
}
export function useSkillUpdates(enabled = false) {
  const { ports } = useFeatures();
  return useQuery({
    queryKey: featureKeys.skillUpdates,
    queryFn: ports.skills.checkUpdates,
    enabled,
  });
}
export function useSkillsShSearch(query: string, page: number) {
  const { ports } = useFeatures();
  return useQuery({
    queryKey: ["v2", "skills", "skills-sh", query, page],
    queryFn: () => ports.skills.searchSkillsSh(query, 20, (page - 1) * 20),
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
  });
}
export function useMcpServers() {
  const { ports } = useFeatures();
  return useQuery({ queryKey: featureKeys.mcp, queryFn: ports.mcp.getAll });
}
export function useFeatureSettings(enabled = false) {
  const { ports } = useFeatures();
  return useQuery({
    queryKey: featureKeys.settings,
    queryFn: ports.settings.get,
    enabled,
  });
}
