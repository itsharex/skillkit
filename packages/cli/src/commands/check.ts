import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Command, Option } from 'clipanion';
import { findAllSkills, findSkill, detectProvider, isLocalPath, evaluateSkillDirectory } from '@skillkit/core';
import { getSearchDirs, loadSkillMetadata, formatCount } from '../helpers.js';
import {
  colors,
  symbols,
  spinner,
  step,
  success,
  warn,
  header,
  formatQualityBadge,
  getQualityGradeFromScore,
} from '../onboarding/index.js';

interface UpdateInfo {
  name: string;
  currentVersion?: string;
  hasUpdate: boolean;
  error?: string;
  qualityScore?: number | null;
  stars?: number | null;
  pushedAt?: string | null;
}

export class CheckCommand extends Command {
  static override paths = [['check']];

  static override usage = Command.Usage({
    description: 'Check installed skills for updates, quality, and activity',
    details: `
      Checks if installed skills have updates available from their sources.
      Shows quality scores and GitHub activity for each skill.
      Does not modify any files - just reports what would be updated.
    `,
    examples: [
      ['Check all skills for updates', '$0 check'],
      ['Check specific skills', '$0 check pdf xlsx'],
      ['Show detailed output', '$0 check --verbose'],
    ],
  });

  skills = Option.Rest();

  verbose = Option.Boolean('--verbose,-v', false, {
    description: 'Show detailed information',
  });

  quiet = Option.Boolean('--quiet,-q', false, {
    description: 'Minimal output',
  });

  async execute(): Promise<number> {
    const searchDirs = getSearchDirs();
    const s = spinner();

    if (!this.quiet) {
      header('Check Updates');
    }

    let skillsToCheck;

    if (this.skills.length > 0) {
      const foundSkills = this.skills.map(name => ({
        name,
        skill: findSkill(name, searchDirs),
      }));

      skillsToCheck = foundSkills
        .filter((s): s is { name: string; skill: NonNullable<typeof s.skill> } => s.skill !== null)
        .map(s => s.skill);

      const notFound = foundSkills.filter(s => s.skill === null).map(s => s.name);
      if (notFound.length > 0) {
        warn(`Skills not found: ${notFound.join(', ')}`);
      }
    } else {
      skillsToCheck = findAllSkills(searchDirs);
    }

    if (skillsToCheck.length === 0) {
      warn('No skills to check');
      return 0;
    }

    if (!this.quiet) {
      step(`Checking ${skillsToCheck.length} skill(s) for updates...`);
      console.log('');
    }

    const results: UpdateInfo[] = [];
    let updatesAvailable = 0;

    for (const skill of skillsToCheck) {
      const metadata = loadSkillMetadata(skill.path);
      const quality = evaluateSkillDirectory(skill.path);
      const qualityScore = quality?.overall ?? null;

      if (!metadata) {
        results.push({
          name: skill.name,
          hasUpdate: false,
          error: 'No metadata (reinstall needed)',
          qualityScore,
        });
        continue;
      }

      if (this.verbose) {
        s.start(`Checking ${skill.name}...`);
      }

      try {
        if (isLocalPath(metadata.source)) {
          const localPath = metadata.subpath
            ? join(metadata.source, metadata.subpath)
            : metadata.source;

          if (!existsSync(localPath)) {
            results.push({
              name: skill.name,
              hasUpdate: false,
              error: 'Local source missing',
              qualityScore,
            });
            if (this.verbose) s.stop(`${skill.name}: source missing`);
            continue;
          }

          const sourceSkillMd = join(localPath, 'SKILL.md');
          const installedSkillMd = join(skill.path, 'SKILL.md');

          if (existsSync(sourceSkillMd) && existsSync(installedSkillMd)) {
            const { statSync } = await import('node:fs');
            const sourceTime = statSync(sourceSkillMd).mtime;
            const installedTime = statSync(installedSkillMd).mtime;

            if (sourceTime > installedTime) {
              results.push({ name: skill.name, hasUpdate: true, qualityScore });
              updatesAvailable++;
              if (this.verbose) s.stop(`${skill.name}: update available`);
            } else {
              results.push({ name: skill.name, hasUpdate: false, qualityScore });
              if (this.verbose) s.stop(`${skill.name}: up to date`);
            }
          } else {
            results.push({ name: skill.name, hasUpdate: false, qualityScore });
            if (this.verbose) s.stop(`${skill.name}: up to date`);
          }
        } else {
          const provider = detectProvider(metadata.source);

          if (!provider) {
            results.push({
              name: skill.name,
              hasUpdate: false,
              error: 'Unknown provider',
              qualityScore,
            });
            if (this.verbose) s.stop(`${skill.name}: unknown provider`);
            continue;
          }

          const parsed = provider.parseSource(metadata.source);
          let stars: number | null = null;
          let pushedAt: string | null = null;

          if (parsed && provider.name === 'GitHub') {
            const activity = await this.fetchGitHubActivity(parsed.owner, parsed.repo);
            if (activity) {
              stars = activity.stars;
              pushedAt = activity.pushedAt;
            }
          }

          results.push({
            name: skill.name,
            hasUpdate: false,
            currentVersion: metadata.updatedAt || metadata.installedAt,
            qualityScore,
            stars,
            pushedAt,
          });
          if (this.verbose) s.stop(`${skill.name}: remote source (run update to sync)`);
        }
      } catch (err) {
        results.push({
          name: skill.name,
          hasUpdate: false,
          error: err instanceof Error ? err.message : 'Check failed',
          qualityScore,
        });
        if (this.verbose) s.stop(`${skill.name}: error`);
      }
    }

    console.log('');

    const withUpdates = results.filter(r => r.hasUpdate);
    const upToDate = results.filter(r => !r.hasUpdate && !r.error);
    const withErrors = results.filter(r => r.error);

    if (withUpdates.length > 0) {
      console.log(colors.primary('Updates available:'));
      for (const r of withUpdates) {
        const badge = this.qualityBadgeFor(r.qualityScore);
        console.log(`  ${colors.success(symbols.arrowUp)} ${colors.primary(r.name)}${badge}`);
      }
      console.log('');
    }

    if (upToDate.length > 0) {
      if (this.verbose) {
        console.log(colors.muted('Up to date:'));
      }
      for (const r of upToDate) {
        const badge = this.qualityBadgeFor(r.qualityScore);
        const activityStr = this.formatActivity(r);
        if (this.verbose) {
          console.log(`  ${colors.muted(symbols.success)} ${colors.muted(r.name)}${badge}${activityStr}`);
        }
      }
      if (this.verbose) console.log('');
    }

    if (withErrors.length > 0) {
      console.log(colors.warning('Could not check:'));
      for (const r of withErrors) {
        const badge = this.qualityBadgeFor(r.qualityScore);
        console.log(`  ${colors.warning(symbols.warning)} ${r.name}${badge}: ${colors.muted(r.error || 'unknown')}`);
      }
      console.log('');
    }

    if (!this.quiet) {
      const qualityScores = results
        .map(r => r.qualityScore)
        .filter((s): s is number => typeof s === 'number');
      if (qualityScores.length > 0) {
        const avg = Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length);
        const grade = getQualityGradeFromScore(avg);
        console.log(colors.muted(`Average quality: ${avg}/100 (${grade})`));
      }
    }

    if (updatesAvailable > 0) {
      success(`${updatesAvailable} update(s) available`);
      console.log(colors.muted('Run `skillkit update` to install updates'));
    } else {
      success('All skills are up to date');
    }

    return 0;
  }

  private qualityBadgeFor(score: number | null | undefined): string {
    if (typeof score !== 'number') return '';
    return ` ${formatQualityBadge(score)}`;
  }

  private formatActivity(r: UpdateInfo): string {
    const parts: string[] = [];
    if (typeof r.stars === 'number' && r.stars > 0) {
      parts.push(`${formatCount(r.stars)} stars`);
    }
    if (r.pushedAt) {
      parts.push(`pushed ${this.timeAgo(r.pushedAt)}`);
    }
    if (parts.length === 0) return '';
    return ` ${colors.muted(`(${parts.join(', ')})`)}`;
  }

  private timeAgo(dateStr: string): string {
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

  private async fetchGitHubActivity(
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
}
