import { Command, Option } from 'clipanion';
import { colors, warn, success, error, step } from '../../onboarding/index.js';
import {
  BUILTIN_PIPELINES,
  getBuiltinPipeline,
  getBuiltinPipelines,
  type AgentPipeline,
} from '@skillkit/core';

export class WorkflowPipelineCommand extends Command {
  static override paths = [['workflow', 'pipeline']];

  static override usage = Command.Usage({
    description: 'Run a built-in agent pipeline',
    details: `
      Pipelines are sequential multi-agent workflows for common development tasks.
      Each pipeline runs agents in order, passing context between stages.
    `,
    examples: [
      ['Run feature pipeline', '$0 workflow pipeline feature'],
      ['Run bugfix pipeline', '$0 workflow pipeline bugfix'],
      ['List available pipelines', '$0 workflow pipeline list'],
    ],
  });

  pipeline = Option.String({ required: false });

  dryRun = Option.Boolean('--dry-run,-n', false, {
    description: 'Show what would be done without executing',
  });

  async execute(): Promise<number> {
    if (!this.pipeline) {
      step('Usage: skillkit workflow pipeline <name>\n');
      console.log('Available pipelines:');
      for (const p of BUILTIN_PIPELINES) {
        console.log(`  ${colors.bold(p.id)} - ${p.description}`);
      }
      console.log();
      console.log(colors.muted('Run: skillkit workflow pipeline list for details'));
      return 0;
    }

    const pipeline = getBuiltinPipeline(this.pipeline);

    if (!pipeline) {
      error(`Pipeline not found: ${this.pipeline}`);
      console.log(colors.muted('Run `skillkit workflow pipeline list` to see available pipelines'));
      return 1;
    }

    if (this.dryRun) {
      return this.showPipeline(pipeline);
    }

    return this.runPipeline(pipeline);
  }

  private showPipeline(pipeline: AgentPipeline): number {
    step(`Pipeline: ${pipeline.name}\n`);
    console.log(`Description: ${pipeline.description}`);
    console.log();
    console.log(colors.bold('Stages:'));

    for (let i = 0; i < pipeline.stages.length; i++) {
      const stage = pipeline.stages[i];
      const arrow = i < pipeline.stages.length - 1 ? '→' : '';
      console.log(`  ${i + 1}. ${colors.bold(stage.name)} (@${stage.agent})`);
      console.log(`     ${colors.muted(stage.description)}`);
      if (arrow) {
        console.log(`     ${colors.muted(arrow)}`);
      }
    }

    console.log();
    console.log(colors.muted('(dry-run mode - no execution)'));

    return 0;
  }

  private async runPipeline(pipeline: AgentPipeline): Promise<number> {
    step(`Starting Pipeline: ${pipeline.name}\n`);

    for (let i = 0; i < pipeline.stages.length; i++) {
      const stage = pipeline.stages[i];
      const stageNum = `[${i + 1}/${pipeline.stages.length}]`;

      console.log(`${colors.info(stageNum)} ${colors.bold(stage.name)}`);
      console.log(`  Agent: @${stage.agent}`);
      console.log(`  ${colors.muted(stage.description)}`);
      console.log();

      warn(`  → Invoke @${stage.agent} for: ${stage.description}`);
      console.log(colors.muted('    (Manual agent invocation required in current implementation)'));
      console.log();
    }

    success('✓ Pipeline stages displayed');
    console.log(colors.muted('Execute each stage by invoking the agents in order'));

    return 0;
  }
}

export class WorkflowPipelineListCommand extends Command {
  static override paths = [['workflow', 'pipeline', 'list']];

  static override usage = Command.Usage({
    description: 'List available pipelines',
    examples: [['List pipelines', '$0 workflow pipeline list']],
  });

  json = Option.Boolean('--json,-j', false, {
    description: 'Output as JSON',
  });

  async execute(): Promise<number> {
    const pipelines = getBuiltinPipelines();

    if (this.json) {
      console.log(JSON.stringify(pipelines, null, 2));
      return 0;
    }

    step(`Available Pipelines (${pipelines.length}):\n`);

    for (const pipeline of pipelines) {
      console.log(colors.bold(`  ${pipeline.id}`));
      console.log(`    ${pipeline.name}: ${pipeline.description}`);
      console.log(`    Stages: ${pipeline.stages.map(s => s.name).join(' → ')}`);
      console.log();
    }

    console.log(colors.muted('Run with: skillkit workflow pipeline <name>'));

    return 0;
  }
}
