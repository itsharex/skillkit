import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { colors, warn, success, error } from '../onboarding/index.js';
import { Command, Option } from 'clipanion';
import { findSkill, findAllSkills, loadMetadata, AgentsMdParser, AgentsMdGenerator } from '@skillkit/core';
import { getSearchDirs } from '../helpers.js';

export class RemoveCommand extends Command {
  static override paths = [['remove'], ['rm'], ['uninstall']];

  static override usage = Command.Usage({
    description: 'Remove installed skills',
    examples: [
      ['Remove a skill', '$0 remove pdf'],
      ['Remove multiple skills', '$0 remove pdf xlsx docx'],
      ['Remove all skills from a source', '$0 remove --source iii-hq/iii'],
      ['Remove all installed skills', '$0 remove --all'],
      ['Force removal without confirmation', '$0 remove --all --force'],
    ],
  });

  skills = Option.Rest({ required: 0 });

  all = Option.Boolean('--all,-a', false, {
    description: 'Remove all installed skills',
  });

  source = Option.String('--source,-s', {
    description: 'Remove all skills installed from this source (e.g. iii-hq/iii)',
  });

  force = Option.Boolean('--force,-f', false, {
    description: 'Skip confirmation',
  });

  async execute(): Promise<number> {
    const searchDirs = getSearchDirs();

    if (!this.all && !this.source && this.skills.length === 0) {
      error('Provide skill names, --source, or --all');
      return 1;
    }

    let skillsToRemove: Array<{ name: string; path: string }> = [];

    if (this.all || this.source) {
      const allSkills = findAllSkills(searchDirs);
      if (this.source) {
        skillsToRemove = allSkills.filter((s) => {
          const meta = loadMetadata(s.path);
          return meta?.source?.includes(this.source!) ?? false;
        }).map((s) => ({ name: s.name, path: s.path }));
        if (skillsToRemove.length === 0) {
          warn(`No skills found from source: ${this.source}`);
          return 0;
        }
      } else {
        skillsToRemove = allSkills.map((s) => ({ name: s.name, path: s.path }));
        if (skillsToRemove.length === 0) {
          warn('No installed skills found');
          return 0;
        }
      }
      console.log(colors.muted(`Found ${skillsToRemove.length} skill(s) to remove`));
    } else {
      for (const skillName of this.skills) {
        const skill = findSkill(skillName, searchDirs);
        if (!skill) {
          warn(`Skill not found: ${skillName}`);
          continue;
        }
        skillsToRemove.push({ name: skill.name, path: skill.path });
      }
    }

    let removed = 0;
    let failed = 0;

    for (const { name: skillName, path: skillPath } of skillsToRemove) {
      if (!existsSync(skillPath)) {
        warn(`Path not found: ${skillPath}`);
        continue;
      }

      try {
        rmSync(skillPath, { recursive: true, force: true });
        if (skillPath.endsWith('.md')) {
          const metaSibling = join(dirname(skillPath), `.${basename(skillPath, '.md')}.skillkit.json`);
          if (existsSync(metaSibling)) rmSync(metaSibling);
        }
        success(`Removed: ${skillName}`);
        removed++;
      } catch (err) {
        error(`Failed to remove: ${skillName}`);
        console.error(colors.muted(err instanceof Error ? err.message : String(err)));
        failed++;
      }
    }

    if (removed > 0) {
      try {
        const agentsMdPath = join(process.cwd(), 'AGENTS.md');
        if (existsSync(agentsMdPath)) {
          const parser = new AgentsMdParser();
          const existing = readFileSync(agentsMdPath, 'utf-8');
          if (parser.hasManagedSections(existing)) {
            const gen = new AgentsMdGenerator({ projectPath: process.cwd() });
            const genResult = gen.generate();
            const updated = parser.updateManagedSections(existing, genResult.sections.filter(s => s.managed));
            writeFileSync(agentsMdPath, updated, 'utf-8');
          }
        }
      } catch (err) {
        warn('Warning: Failed to update AGENTS.md');
        console.error(colors.muted(err instanceof Error ? err.message : String(err)));
      }
      console.log(colors.muted('\nRun `skillkit sync` to update your agent config'));
    }

    return failed > 0 ? 1 : 0;
  }
}
