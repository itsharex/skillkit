import { Command, Option } from 'clipanion';
import { resolve } from 'node:path';
import { colors, warn, error, step } from '../../onboarding/index.js';
import { listWorkflows } from '@skillkit/core';

/**
 * Workflow List command - list available workflows
 */
export class WorkflowListCommand extends Command {
  static override paths = [['workflow', 'list'], ['wf', 'list'], ['workflow', 'ls'], ['wf', 'ls']];

  static override usage = Command.Usage({
    description: 'List available workflows',
    details: `
      The workflow list command shows all available workflows
      defined in .skillkit/workflows/
    `,
    examples: [
      ['List all workflows', '$0 workflow list'],
      ['List with details', '$0 workflow list --verbose'],
    ],
  });

  // Verbose output
  verbose = Option.Boolean('--verbose,-v', false, {
    description: 'Show detailed workflow information',
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

    let workflows: ReturnType<typeof listWorkflows>;
    try {
      workflows = listWorkflows(targetPath);
    } catch (err) {
      error('Failed to list workflows.');
      console.log(colors.muted(String(err)));
      return 1;
    }

    if (this.json) {
      console.log(JSON.stringify(workflows, null, 2));
      return 0;
    }

    if (workflows.length === 0) {
      warn('No workflows found.');
      console.log(colors.muted('Create a workflow with: skillkit workflow create'));
      console.log(colors.muted('Or add YAML files to .skillkit/workflows/'));
      return 0;
    }

    step(`Available Workflows (${workflows.length}):\n`);

    for (const workflow of workflows) {
      console.log(`  ${colors.bold(workflow.name)}`);

      if (workflow.description) {
        console.log(`    ${colors.muted(workflow.description)}`);
      }

      if (this.verbose) {
        console.log(`    Version: ${colors.muted(workflow.version || 'N/A')}`);
        console.log(`    Waves: ${colors.muted(workflow.waves.length.toString())}`);

        const totalSkills = workflow.waves.reduce(
          (sum, wave) => sum + wave.skills.length,
          0
        );
        console.log(`    Total Skills: ${colors.muted(totalSkills.toString())}`);

        if (workflow.tags && workflow.tags.length > 0) {
          console.log(`    Tags: ${colors.muted(workflow.tags.join(', '))}`);
        }
      }

      console.log();
    }

    console.log(colors.muted('Run a workflow with: skillkit workflow run <name>'));

    return 0;
  }
}
