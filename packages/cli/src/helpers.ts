import {
  loadConfig,
  getSearchDirs as coreGetSearchDirs,
  getInstallDir as coreGetInstallDir,
  getAgentConfigPath as coreGetAgentConfigPath,
  initProject as coreInitProject,
  loadSkillMetadata as coreLoadSkillMetadata,
  saveSkillMetadata as coreSaveSkillMetadata,
} from "@skillkit/core";
import { getAdapter, detectAgent, getAllAdapters } from "@skillkit/agents";
import type { AgentType, AgentAdapterInfo } from "@skillkit/core";

export const loadSkillMetadata = coreLoadSkillMetadata;
export const saveSkillMetadata = coreSaveSkillMetadata;

function toAdapterInfo(adapter: { type: AgentType; name: string; skillsDir: string; configFile: string }): AgentAdapterInfo {
  return { type: adapter.type, name: adapter.name, skillsDir: adapter.skillsDir, configFile: adapter.configFile };
}

export function getSearchDirs(agentType?: AgentType): string[] {
  const dirs = new Set<string>();
  const adapters = agentType ? [getAdapter(agentType)] : getAllAdapters();
  for (const adapter of adapters) {
    for (const dir of coreGetSearchDirs(toAdapterInfo(adapter))) {
      dirs.add(dir);
    }
  }
  return [...dirs];
}

export function getInstallDir(global = false, agentType?: AgentType): string {
  const type = agentType || loadConfig().agent;
  return coreGetInstallDir(toAdapterInfo(getAdapter(type)), global);
}

export function getAgentConfigPath(agentType?: AgentType): string {
  const type = agentType || loadConfig().agent;
  return coreGetAgentConfigPath(toAdapterInfo(getAdapter(type)));
}

export async function initProject(agentType?: AgentType): Promise<void> {
  const type = agentType || (await detectAgent());
  return coreInitProject(type, toAdapterInfo(getAdapter(type)));
}

export function formatCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}
