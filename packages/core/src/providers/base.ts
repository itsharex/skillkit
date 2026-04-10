import { spawn, execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import type { GitProvider, CloneResult } from '../types.js';
import { SKILL_DISCOVERY_PATHS } from '../skills.js';

export interface GitProviderAdapter {
  readonly type: GitProvider;
  readonly name: string;
  readonly baseUrl: string;

  parseSource(source: string): { owner: string; repo: string; subpath?: string } | null;
  matches(source: string): boolean;
  getCloneUrl(owner: string, repo: string): string;
  getSshUrl(owner: string, repo: string): string;
  clone(source: string, targetDir: string, options?: CloneOptions): Promise<CloneResult>;
}

export interface CloneOptions {
  depth?: number;
  branch?: string;
  ssh?: boolean;
  onProgress?: (message: string) => void;
}

function parseGitProgress(text: string): string | null {
  const lines = text.split(/[\r\n]+/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;

    const pctMatch = line.match(/([\w\s]+):\s*(\d+)%\s*\((\d+)\/(\d+)\)(?:,\s*(.+?))?(?:\s*$|\s*\r)/);
    if (pctMatch) {
      const phase = pctMatch[1].replace(/^remote:\s*/, '').trim();
      const pct = pctMatch[2];
      const size = pctMatch[5]?.replace(/,?\s*done\.?$/, '').trim();
      return size ? `${phase} ${pct}% ${size}` : `${phase} ${pct}%`;
    }

    const remoteMatch = line.match(/remote:\s*([\w\s]+):\s*(\d+)%/);
    if (remoteMatch) {
      return `${remoteMatch[1].trim()} ${remoteMatch[2]}%`;
    }

    const remoteDone = line.match(/remote:\s*([\w\s]+):\s*\d+.*done/);
    if (remoteDone) {
      return `${remoteDone[1].trim()}`;
    }
  }
  return null;
}

function spawnGit(args: string[]): Promise<void>;
function spawnGit(args: string[], onProgress: (msg: string) => void): Promise<void>;
function spawnGit(args: string[], onProgress?: (msg: string) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn('git', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      if (onProgress) {
        const msg = parseGitProgress(text);
        if (msg) onProgress(msg);
      }
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-500)));
    });

    proc.on('error', reject);
  });
}

export async function cloneRepo(
  cloneUrl: string,
  tempDir: string,
  options: CloneOptions = {},
): Promise<void> {
  const args = ['clone', '--progress', '--single-branch', '--no-tags'];

  if (options.depth) {
    args.push('--depth', String(options.depth));
  }
  if (options.branch) {
    args.push('--branch', options.branch);
  }

  const tryPartialClone = !options.branch;

  if (tryPartialClone) {
    const partialArgs = [...args, '--filter=blob:none', '--no-checkout', cloneUrl, tempDir];

    try {
      await spawnGit(partialArgs, options.onProgress ?? (() => {}));

      execFileSync('git', ['-C', tempDir, 'sparse-checkout', 'init', '--cone'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const sparsePaths = SKILL_DISCOVERY_PATHS.filter((p) => !p.includes('/'));
      const deepPaths = SKILL_DISCOVERY_PATHS.filter((p) => p.includes('/'));
      execFileSync(
        'git',
        ['-C', tempDir, 'sparse-checkout', 'set', ...sparsePaths, ...deepPaths],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );

      options.onProgress?.('Checking out files');
      await spawnGit(['-C', tempDir, 'checkout'], options.onProgress ?? (() => {}));

      return;
    } catch {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }

  args.push(cloneUrl, tempDir);
  await spawnGit(args, options.onProgress ?? (() => {}));
}

export function parseShorthand(source: string): { owner: string; repo: string; subpath?: string } | null {
  const cleaned = source.replace(/^\/+|\/+$/g, '');
  const parts = cleaned.split('/');

  if (parts.length < 2) {
    return null;
  }

  const owner = parts[0];
  const repo = parts[1];
  const subpath = parts.length > 2 ? parts.slice(2).join('/') : undefined;

  return { owner, repo, subpath };
}

export function isLocalPath(source: string): boolean {
  return (
    source.startsWith('/') ||
    source.startsWith('./') ||
    source.startsWith('../') ||
    source.startsWith('~/') ||
    source.startsWith('.')
  );
}

export function isGitUrl(source: string): boolean {
  return (
    source.startsWith('git@') ||
    source.startsWith('https://') ||
    source.startsWith('http://') ||
    source.startsWith('ssh://')
  );
}
