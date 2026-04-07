import { Command, Option } from 'clipanion';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { colors, step, success, error, spinner } from '../onboarding/index.js';
import {
  createExecutionEngine,
  discoverSkills,
  extractFrontmatter,
  type ExecutableSkill,
  type ExecutableTask,
  type AgentType,
} from '@skillkit/core';

/**
 * Run command - execute a skill
 */
export class RunCommand extends Command {
  static override paths = [['run']];

  static override usage = Command.Usage({
    description: 'Execute a skill with task-based orchestration',
    details: `
      The run command executes a skill, optionally breaking it down into
      tasks with verification checkpoints.

      Skills can be:
      - Installed skills (by name)
      - Local skill files (by path)
      - Remote skills (owner/repo/path)
    `,
    examples: [
      ['Run an installed skill', '$0 run typescript-strict-mode'],
      ['Run a local skill file', '$0 run ./my-skill/SKILL.md'],
      ['Dry run (show what would happen)', '$0 run typescript-strict-mode --dry-run'],
      ['Run with verification', '$0 run setup-testing --verify'],
    ],
  });

  // Skill name or path
  skillRef = Option.String({ required: true });

  // Target agent
  agent = Option.String('--agent,-a', {
    description: 'Target agent (claude-code, cursor, etc.)',
  });

  // Dry run
  dryRun = Option.Boolean('--dry-run,-n', false, {
    description: 'Show what would be executed without running',
  });

  // Enable verification
  verify = Option.Boolean('--verify', false, {
    description: 'Run verification checks after each task',
  });

  // Auto-commit
  autoCommit = Option.Boolean('--auto-commit', false, {
    description: 'Create git commits after each task',
  });

  // Continue on error
  continueOnError = Option.Boolean('--continue-on-error', false, {
    description: 'Continue execution even if a task fails',
  });

  // Verbose output
  verbose = Option.Boolean('--verbose,-v', false, {
    description: 'Show detailed execution progress',
  });

  // JSON output
  json = Option.Boolean('--json,-j', false, {
    description: 'Output in JSON format',
  });

  // Project path
  projectPath = Option.String('--path,-p', {
    description: 'Project path (default: current directory)',
  });

  async execute(): Promise<number> {
    const targetPath = resolve(this.projectPath || process.cwd());

    // Load the skill
    const skill = await this.loadSkill(targetPath);
    if (!skill) {
      return 1;
    }

    if (!this.json) {
      step(`Executing skill: ${colors.bold(skill.name)}`);
      if (skill.description) {
        console.log(colors.muted(skill.description));
      }
      console.log();
    }

    if (this.dryRun) {
      this.showDryRun(skill);
      return 0;
    }

    const oraSpinner = spinner();
    let currentTask = '';

    // Create execution engine
    const engine = createExecutionEngine(targetPath, {
      onProgress: (event) => {
        if (this.json) return;

        switch (event.type) {
          case 'task_start':
            currentTask = event.taskName || '';
            oraSpinner.start(`Task ${(event.taskIndex || 0) + 1}/${event.totalTasks}: ${currentTask}`);
            break;

          case 'task_complete': {
            const icon = event.status === 'completed' ? colors.success('✓') : colors.error('✗');
            oraSpinner.stop();
            console.log(`${icon} Task ${(event.taskIndex || 0) + 1}/${event.totalTasks}: ${currentTask}`);
            if (event.error && this.verbose) {
              console.log(colors.error(`    Error: ${event.error}`));
            }
            break;
          }

          case 'checkpoint':
            oraSpinner.stop();
            console.log(`Checkpoint: ${event.message}`);
            break;

          case 'verification':
            if (this.verbose) {
              console.log(colors.muted(`    ${event.message}`));
            }
            break;

          case 'complete':
            console.log();
            if (event.status === 'completed') {
              success('✓ Skill execution completed');
            } else {
              error(`✗ Skill execution ${event.status}`);
              if (event.error) {
                console.log(colors.error(`  Error: ${event.error}`));
              }
            }
            break;
        }
      },
      checkpointHandler: async (task, _context) => {
        // For CLI, we auto-continue but could add interactive prompts
        if (task.type === 'checkpoint:decision' && task.options) {
          // Use first option by default
          return {
            continue: true,
            selectedOption: task.options[0],
          };
        }
        return { continue: true };
      },
    });

    // Execute the skill
    const result = await engine.execute(skill, {
      agent: this.agent as AgentType | undefined,
      autoCommit: this.autoCommit,
      verify: this.verify,
      continueOnError: this.continueOnError,
    });

    if (this.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log();
      step('Summary:');
      console.log(`  Duration: ${colors.muted(this.formatDuration(result.durationMs || 0))}`);
      console.log(`  Tasks: ${colors.muted(`${result.tasks.filter(t => t.status === 'completed').length}/${result.tasks.length} completed`)}`);

      if (result.filesModified.length > 0) {
        console.log(`  Files modified: ${colors.muted(result.filesModified.length.toString())}`);
      }

      if (result.commits.length > 0) {
        console.log(`  Commits: ${colors.muted(result.commits.join(', '))}`);
      }
    }

    return result.status === 'completed' ? 0 : 1;
  }

  private async loadSkill(projectPath: string): Promise<ExecutableSkill | null> {
    // Check if it's a file path (must be a file, not directory)
    if (this.skillRef.endsWith('.md') || (existsSync(this.skillRef) && statSync(this.skillRef).isFile())) {
      return this.loadSkillFromFile(resolve(this.skillRef));
    }

    // Check installed skills
    const skill = this.findInstalledSkill(projectPath, this.skillRef);
    if (skill) {
      return skill;
    }

    console.error(colors.error(`Skill "${this.skillRef}" not found`));
    console.log(colors.muted('Install skills with: skillkit install <source>'));
    return null;
  }

  private loadSkillFromFile(filePath: string): ExecutableSkill | null {
    if (!existsSync(filePath)) {
      console.error(colors.error(`File not found: ${filePath}`));
      return null;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const frontmatter = extractFrontmatter(content);

      const tasks = this.parseTasksFromFrontmatter(frontmatter);

      return {
        name: (frontmatter?.name as string) || this.skillRef,
        description: frontmatter?.description as string,
        version: frontmatter?.version as string,
        source: filePath,
        content,
        tasks,
      };
    } catch (err) {
      console.error(colors.error(`Failed to load skill: ${err}`));
      return null;
    }
  }

  private findInstalledSkill(projectPath: string, skillName: string): ExecutableSkill | null {
    // Search in common skill directories
    const skillDirs = [
      join(projectPath, '.claude', 'skills'),
      join(projectPath, '.cursor', 'skills'),
      join(projectPath, 'skills'),
      join(projectPath, '.skillkit', 'skills'),
    ];

    for (const dir of skillDirs) {
      if (!existsSync(dir)) continue;

      const skills = discoverSkills(dir);
      const skill = skills.find((s) => s.name === skillName);

      if (skill) {
        const skillMdPath = join(skill.path, 'SKILL.md');
        if (existsSync(skillMdPath)) {
          return this.loadSkillFromFile(skillMdPath);
        }
      }
    }

    return null;
  }

  private parseTasksFromFrontmatter(frontmatter: Record<string, unknown> | null): ExecutableTask[] | undefined {
    if (!frontmatter?.tasks || !Array.isArray(frontmatter.tasks)) {
      return undefined;
    }

    return frontmatter.tasks.map((task: Record<string, unknown>, index: number) => ({
      id: (task.id as string) || `task-${index}`,
      name: (task.name as string) || `Task ${index + 1}`,
      type: (task.type as ExecutableTask['type']) || 'auto',
      action: (task.action as string) || '',
      files: task.files as string[] | undefined,
      options: task.options as string[] | undefined,
      verify: task.verify as ExecutableTask['verify'],
    }));
  }

  private showDryRun(skill: ExecutableSkill): void {
    step('Dry Run - Execution Plan');
    console.log();
    console.log(`Skill: ${colors.bold(skill.name)}`);
    if (skill.description) {
      console.log(`Description: ${colors.muted(skill.description)}`);
    }
    console.log(`Source: ${colors.muted(skill.source)}`);
    console.log();

    if (skill.tasks && skill.tasks.length > 0) {
      step('Tasks:');
      for (let i = 0; i < skill.tasks.length; i++) {
        const task = skill.tasks[i];
        const typeLabel = this.getTaskTypeLabel(task.type);
        console.log(`  ${i + 1}. ${task.name} ${typeLabel}`);
        if (task.action) {
          console.log(`     ${colors.muted(task.action)}`);
        }
        if (task.files && task.files.length > 0) {
          console.log(`     Files: ${colors.muted(task.files.join(', '))}`);
        }
      }
    } else {
      console.log(colors.muted('No structured tasks defined. Skill will be executed as a single unit.'));
    }

    console.log();
    console.log(colors.muted('This is a dry run. Remove --dry-run to execute.'));
  }

  private getTaskTypeLabel(type: string): string {
    switch (type) {
      case 'auto':
        return colors.success('[auto]');
      case 'checkpoint:human-verify':
        return colors.warning('[verify]');
      case 'checkpoint:decision':
        return colors.info('[decision]');
      case 'checkpoint:human-action':
        return colors.magenta('[manual]');
      default:
        return '';
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
}
