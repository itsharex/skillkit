import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { colors, warn, success, error } from '../onboarding/index.js';
import { Command, Option } from 'clipanion';
import { findSkill, AgentsMdParser, AgentsMdGenerator } from '@skillkit/core';
import { getSearchDirs } from '../helpers.js';

export class RemoveCommand extends Command {
  static override paths = [['remove'], ['rm'], ['uninstall']];

  static override usage = Command.Usage({
    description: 'Remove installed skills',
    examples: [
      ['Remove a skill', '$0 remove pdf'],
      ['Remove multiple skills', '$0 remove pdf xlsx docx'],
      ['Force removal without confirmation', '$0 remove pdf --force'],
    ],
  });

  skills = Option.Rest({ required: 1 });

  force = Option.Boolean('--force,-f', false, {
    description: 'Skip confirmation',
  });

  async execute(): Promise<number> {
    const searchDirs = getSearchDirs();
    let removed = 0;
    let failed = 0;

    for (const skillName of this.skills) {
      const skill = findSkill(skillName, searchDirs);

      if (!skill) {
        warn(`Skill not found: ${skillName}`);
        continue;
      }

      if (!existsSync(skill.path)) {
        warn(`Path not found: ${skill.path}`);
        continue;
      }

      try {
        rmSync(skill.path, { recursive: true, force: true });
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
