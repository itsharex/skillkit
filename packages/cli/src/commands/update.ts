import { existsSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { Command, Option } from 'clipanion';
import { findAllSkills, findSkill, detectProvider, isLocalPath } from '@skillkit/core';
import { getSearchDirs, loadSkillMetadata, saveSkillMetadata } from '../helpers.js';
import { colors, spinner, warn, step, error } from '../onboarding/index.js';

export class UpdateCommand extends Command {
  static override paths = [['update'], ['u']];

  static override usage = Command.Usage({
    description: 'Update skills from their original sources',
    examples: [
      ['Update all skills', '$0 update'],
      ['Update specific skills', '$0 update pdf xlsx'],
      ['Force update (overwrite local changes)', '$0 update --force'],
    ],
  });

  skills = Option.Rest();

  force = Option.Boolean('--force,-f', false, {
    description: 'Force update even if local changes exist',
  });

  async execute(): Promise<number> {
    const s = spinner();
    const searchDirs = getSearchDirs();

    let skillsToUpdate;

    if (this.skills.length > 0) {
      skillsToUpdate = this.skills
        .map(name => findSkill(name, searchDirs))
        .filter((s): s is NonNullable<typeof s> => s !== null);

      const notFound = this.skills.filter(name => !findSkill(name, searchDirs));
      if (notFound.length > 0) {
        warn(`Skills not found: ${notFound.join(', ')}`);
      }
    } else {
      skillsToUpdate = findAllSkills(searchDirs);
    }

    if (skillsToUpdate.length === 0) {
      warn('No skills to update');
      return 0;
    }

    step(`Updating ${skillsToUpdate.length} skill(s)...`);

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const skill of skillsToUpdate) {
      const metadata = loadSkillMetadata(skill.path);

      if (!metadata) {
        console.log(colors.muted(`Skipping ${skill.name} (no metadata, reinstall needed)`));
        skipped++;
        continue;
      }

      s.start(`Updating ${skill.name}...`);

      try {
        if (isLocalPath(metadata.source)) {
          const localPath = metadata.subpath
            ? join(metadata.source, metadata.subpath)
            : metadata.source;

          if (!existsSync(localPath)) {
            s.stop(colors.warning(`${skill.name}: local source missing`));
            skipped++;
            continue;
          }

          const skillMdPath = join(localPath, 'SKILL.md');
          if (!existsSync(skillMdPath)) {
            s.stop(colors.warning(`${skill.name}: no SKILL.md at source`));
            skipped++;
            continue;
          }

          rmSync(skill.path, { recursive: true, force: true });
          cpSync(localPath, skill.path, { recursive: true, dereference: true });

          metadata.updatedAt = new Date().toISOString();
          saveSkillMetadata(skill.path, metadata);

          s.stop(`Updated ${skill.name}`);
          updated++;
        } else {
          const provider = detectProvider(metadata.source);

          if (!provider) {
            s.stop(colors.warning(`${skill.name}: unknown provider`));
            skipped++;
            continue;
          }

          const result = await provider.clone(metadata.source, '', { depth: 1 });

          if (!result.success || !result.path) {
            s.stop(colors.error(`${skill.name}: ${result.error || 'clone failed'}`));
            failed++;
            continue;
          }

          const sourcePath = metadata.subpath
            ? join(result.path, metadata.subpath)
            : result.path;

          const skillMdPath = join(sourcePath, 'SKILL.md');
          if (!existsSync(skillMdPath)) {
            s.stop(colors.warning(`${skill.name}: no SKILL.md in source`));
            rmSync(result.path, { recursive: true, force: true });
            skipped++;
            continue;
          }

          rmSync(skill.path, { recursive: true, force: true });
          cpSync(sourcePath, skill.path, { recursive: true, dereference: true });

          rmSync(result.path, { recursive: true, force: true });

          metadata.updatedAt = new Date().toISOString();
          saveSkillMetadata(skill.path, metadata);

          s.stop(`Updated ${skill.name}`);
          updated++;
        }
      } catch (err) {
        s.stop(colors.error(`Failed to update ${skill.name}`));
        error(colors.muted(err instanceof Error ? err.message : String(err)));
        failed++;
      }
    }

    console.log();
    step(`Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);

    return failed > 0 ? 1 : 0;
  }
}
