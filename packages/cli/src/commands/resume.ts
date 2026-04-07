import { Command, Option } from 'clipanion';
import { resolve } from 'node:path';
import { colors, warn, success, error } from '../onboarding/index.js';
import { SessionManager } from '@skillkit/core';

/**
 * Resume command - resume paused skill execution
 */
export class ResumeCommand extends Command {
  static override paths = [['resume']];

  static override usage = Command.Usage({
    description: 'Resume a paused skill execution',
    details: `
      The resume command continues a previously paused skill execution
      from where it left off.

      The execution state is preserved, including:
      - Completed tasks
      - User decisions
      - Modified files
    `,
    examples: [
      ['Resume paused execution', '$0 resume'],
    ],
  });

  // Project path
  projectPath = Option.String('--path,-p', {
    description: 'Project path (default: current directory)',
  });

  async execute(): Promise<number> {
    const targetPath = resolve(this.projectPath || process.cwd());
    const manager = new SessionManager(targetPath);
    const state = manager.get();

    if (!state) {
      warn('No active session found.');
      return 1;
    }

    if (!state.currentExecution) {
      warn('No skill execution to resume.');
      console.log(colors.muted('Start a new execution with: skillkit run <skill>'));
      return 1;
    }

    if (state.currentExecution.status !== 'paused') {
      if (state.currentExecution.status === 'running') {
        warn('Execution is already running.');
      } else {
        warn(`Execution is ${state.currentExecution.status}.`);
      }
      return 1;
    }

    const resumed = manager.resume();

    if (resumed) {
      const exec = state.currentExecution;
      success('✓ Execution resumed');
      console.log();
      console.log(`  Skill: ${colors.bold(exec.skillName)}`);
      console.log(`  Progress: ${exec.currentStep}/${exec.totalSteps} tasks`);
      console.log();

      const nextTask = exec.tasks.find((t) => t.status === 'pending' || t.status === 'in_progress');
      if (nextTask) {
        console.log(`  Next task: ${colors.cyan(nextTask.name)}`);
      }

      console.log();
      console.log(colors.muted('The execution will continue from where it left off.'));
      console.log(colors.muted('View status: skillkit status'));
      return 0;
    } else {
      error('Failed to resume execution.');
      return 1;
    }
  }
}
