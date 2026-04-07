import { Command, Option } from 'clipanion';
import { resolve } from 'node:path';
import { colors, success, error as errorFn, spinner } from '../../onboarding/index.js';
import {
  loadWorkflowByName,
  loadWorkflow,
  validateWorkflow,
  createWorkflowOrchestrator,
  createSkillExecutor,
  createSimulatedSkillExecutor,
  type AgentType,
} from '@skillkit/core';

/**
 * Workflow Run command - execute a workflow
 */
export class WorkflowRunCommand extends Command {
  static override paths = [['workflow', 'run'], ['wf', 'run']];

  static override usage = Command.Usage({
    description: 'Execute a skill workflow',
    details: `
      The workflow run command executes a workflow definition,
      running skills in waves with parallel or sequential execution.

      Workflows are defined in YAML files in .skillkit/workflows/
    `,
    examples: [
      ['Run a workflow by name', '$0 workflow run setup-project'],
      ['Run a workflow from file', '$0 workflow run --file my-workflow.yaml'],
      ['Dry run (no execution)', '$0 workflow run setup-project --dry-run'],
    ],
  });

  // Workflow name
  workflowName = Option.String({ required: false });

  // Workflow file path
  file = Option.String('--file,-f', {
    description: 'Path to workflow YAML file',
  });

  // Dry run
  dryRun = Option.Boolean('--dry-run,-n', false, {
    description: 'Show what would be executed without running',
  });

  // Verbose output
  verbose = Option.Boolean('--verbose,-v', false, {
    description: 'Show detailed execution progress',
  });

  // Continue on error
  continueOnError = Option.Boolean('--continue-on-error', false, {
    description: 'Continue execution even if a skill fails',
  });

  // JSON output
  json = Option.Boolean('--json,-j', false, {
    description: 'Output in JSON format',
  });

  // Project path
  projectPath = Option.String('--path,-p', {
    description: 'Project path (default: current directory)',
  });

  // Agent to use for execution
  agent = Option.String('--agent,-a', {
    description: 'Agent to use for skill execution (e.g., claude-code, codex)',
  });

  // Simulate execution (for testing)
  simulate = Option.Boolean('--simulate', false, {
    description: 'Simulate execution without running skills (for testing)',
  });

  async execute(): Promise<number> {
    const targetPath = resolve(this.projectPath || process.cwd());

    // Load workflow
    let workflow;
    try {
      if (this.file) {
        workflow = loadWorkflow(resolve(this.file));
      } else if (this.workflowName) {
        workflow = loadWorkflowByName(targetPath, this.workflowName);
        if (!workflow) {
          errorFn(`Workflow "${this.workflowName}" not found`);
          console.log(colors.muted('List available workflows: skillkit workflow list'));
          return 1;
        }
      } else {
        errorFn('Please specify a workflow name or --file');
        return 1;
      }
    } catch (err) {
      errorFn(`Failed to load workflow: ${err}`);
      return 1;
    }

    // Validate workflow
    const validation = validateWorkflow(workflow);
    if (!validation.valid) {
      errorFn('Invalid workflow:');
      for (const validationError of validation.errors) {
        errorFn(`  • ${validationError}`);
      }
      return 1;
    }

    // Dry run mode
    if (this.dryRun) {
      this.showDryRun(workflow);
      return 0;
    }

    // Execute workflow
    console.log(colors.cyan(`Executing workflow: ${colors.bold(workflow.name)}`));
    if (workflow.description) {
      console.log(colors.muted(workflow.description));
    }
    console.log();

    const spin = spinner();
    let currentWave = -1;

    // Create the skill executor (real or simulated)
    const skillExecutor = this.simulate
      ? createSimulatedSkillExecutor({
          delay: 500,
          onExecute: (skillName) => {
            if (this.verbose && !this.json) {
              console.log(colors.muted(`  [Simulated] ${skillName}`));
            }
          },
        })
      : createSkillExecutor({
          projectPath: targetPath,
          preferredAgent: this.agent as AgentType | undefined,
          fallbackToAvailable: true,
          onExecutionEvent: (event) => {
            if (this.verbose && !this.json) {
              switch (event.type) {
                case 'skill_found':
                  console.log(colors.muted(`  Found: ${event.message}`));
                  break;
                case 'skill_not_found':
                  console.log(colors.error(`  Not found: ${event.skillName}`));
                  break;
                case 'agent_selected':
                  console.log(colors.muted(`  Agent: ${event.agent}`));
                  break;
                case 'execution_complete':
                  if (!event.success) {
                    console.log(colors.error(`  Error: ${event.error}`));
                  }
                  break;
              }
            }
          },
        });

    // Create orchestrator with real skill executor
    const orchestrator = createWorkflowOrchestrator(
      skillExecutor,
      (event) => {
        if (this.json) return;

        switch (event.type) {
          case 'wave_start':
            currentWave = event.waveIndex || 0;
            spin.start(`Wave ${currentWave + 1}: ${event.waveName || 'Executing...'}`);
            break;

          case 'skill_start':
            if (this.verbose) {
              spin.message(`Wave ${currentWave + 1}: Running ${event.skillName}...`);
            }
            break;

          case 'skill_complete':
            if (this.verbose) {
              const icon = event.status === 'completed' ? colors.success('✓') : colors.error('✗');
              console.log(`  ${icon} ${event.skillName}`);
            }
            break;

          case 'wave_complete':
            spin.stop(`Wave ${(event.waveIndex || 0) + 1}: ${event.waveName || 'Complete'}`);
            break;

          case 'workflow_complete':
            console.log();
            if (event.status === 'completed') {
              success('✓ Workflow completed successfully');
            } else {
              errorFn(`✗ Workflow ${event.status}`);
              if (event.error) {
                errorFn(`  Error: ${event.error}`);
              }
            }
            break;
        }
      }
    );

    const execution = await orchestrator.execute(workflow);

    if (this.json) {
      console.log(JSON.stringify(execution, null, 2));
    }

    return execution.status === 'completed' ? 0 : 1;
  }

  private showDryRun(workflow: { name: string; description?: string; waves: Array<{ name?: string; parallel: boolean; skills: Array<string | { skill: string }> }> }): void {
    console.log(colors.cyan('Dry Run - Workflow Execution Plan'));
    console.log();
    console.log(`Workflow: ${colors.bold(workflow.name)}`);
    if (workflow.description) {
      console.log(`Description: ${colors.muted(workflow.description)}`);
    }
    console.log();

    for (let i = 0; i < workflow.waves.length; i++) {
      const wave = workflow.waves[i];
      const modeLabel = wave.parallel ? colors.info('[parallel]') : colors.warning('[sequential]');

      console.log(`${colors.cyan(`Wave ${i + 1}`)}: ${wave.name || 'Unnamed'} ${modeLabel}`);

      for (const skill of wave.skills) {
        const skillName = typeof skill === 'string' ? skill : skill.skill;
        console.log(`  • ${skillName}`);
      }

      console.log();
    }

    console.log(colors.muted('This is a dry run. No skills were executed.'));
    console.log(colors.muted('Remove --dry-run to execute the workflow.'));
  }
}
