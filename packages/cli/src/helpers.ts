import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
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

export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const days = Math.floor((now - then) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export interface TapEntry {
  source: string;
  name?: string;
  addedAt: string;
}

export interface TapsFile {
  version: 1;
  taps: TapEntry[];
}

const TAPS_FILE = join(homedir(), '.skillkit', 'taps.json');

export function loadTaps(): TapsFile {
  if (!existsSync(TAPS_FILE)) return { version: 1, taps: [] };
  try {
    const data = JSON.parse(readFileSync(TAPS_FILE, 'utf-8'));
    if (data && data.version === 1 && Array.isArray(data.taps)) {
      return data as TapsFile;
    }
    return { version: 1, taps: [] };
  } catch {
    return { version: 1, taps: [] };
  }
}

export function saveTaps(taps: TapsFile): void {
  const dir = dirname(TAPS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(TAPS_FILE, JSON.stringify(taps, null, 2), 'utf-8');
}

export async function fetchGitHubActivity(
  owner: string,
  repo: string,
): Promise<{ stars: number; pushedAt: string | null } | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown>;
    return {
      stars: typeof data.stargazers_count === 'number' ? data.stargazers_count : 0,
      pushedAt: typeof data.pushed_at === 'string' ? data.pushed_at : null,
    };
  } catch {
    return null;
  }
}
