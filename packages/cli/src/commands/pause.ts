import { Command, Option } from 'clipanion';
import { resolve } from 'node:path';
import { colors, warn, success, error } from '../onboarding/index.js';
import { SessionManager } from '@skillkit/core';

/**
 * Pause command - pause current skill execution
 */
export class PauseCommand extends Command {
  static override paths = [['pause']];

  static override usage = Command.Usage({
    description: 'Pause current skill execution for later resumption',
    details: `
      The pause command saves the current execution state so you can
      continue later with "skillkit resume".

      This is useful when you need to:
      - Take a break from a long skill execution
      - Handle an interruption
      - Review progress before continuing
    `,
    examples: [
      ['Pause current execution', '$0 pause'],
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
      warn('No skill execution in progress.');
      return 1;
    }

    if (state.currentExecution.status === 'paused') {
      warn('Execution is already paused.');
      console.log(colors.muted('Resume with: skillkit resume'));
      return 0;
    }

    const paused = manager.pause();

    if (paused) {
      const exec = state.currentExecution;
      success('✓ Execution paused');
      console.log();
      console.log(`  Skill: ${colors.bold(exec.skillName)}`);
      console.log(`  Progress: ${exec.currentStep}/${exec.totalSteps} tasks completed`);
      console.log();
      console.log(colors.muted('Resume with: skillkit resume'));
      console.log(colors.muted('View status: skillkit status'));
      return 0;
    } else {
      error('Failed to pause execution.');
      return 1;
    }
  }
}
