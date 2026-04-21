import { Command, Option } from 'clipanion';
import { resolve } from 'node:path';
import { colors, warn, error, step } from '../onboarding/index.js';
import {
  type AgentType,
  AgentType as AgentTypeSchema,
  generatePrimer,
  analyzePrimer,
  analyzeGitHistory,
  addPattern,
  AGENT_CONFIG,
} from '@skillkit/core';

export class PrimerCommand extends Command {
  static override paths = [['primer']];

  static override usage = Command.Usage({
    description: 'Analyze codebase and generate AI instruction files for agents',
    details: `
      The primer command analyzes your codebase to detect languages, frameworks,
      patterns, and conventions, then generates customized instruction files
      for AI coding agents.

      By default, it generates instructions for detected agents in your project.
      Use --all-agents to generate for all 46 supported agents.

      Inspired by github.com/pierceboggan/primer but extended for all SkillKit agents.
    `,
    examples: [
      ['Generate for detected agents', '$0 primer'],
      ['Generate for all 46 agents', '$0 primer --all-agents'],
      ['Generate for specific agents', '$0 primer --agent claude-code,cursor,github-copilot'],
      ['Custom output directory', '$0 primer --output ./instructions'],
      ['Preview without writing files', '$0 primer --dry-run'],
      ['Only show analysis', '$0 primer --analyze-only'],
      ['Verbose output', '$0 primer --verbose'],
    ],
  });

  agent = Option.String('--agent,-a', {
    description: 'Comma-separated list of agents to generate for',
  });

  allAgents = Option.Boolean('--all-agents,-A', false, {
    description: 'Generate for all 46 supported agents',
  });

  output = Option.String('--output,-o', {
    description: 'Output directory for generated files',
  });

  dryRun = Option.Boolean('--dry-run,-n', false, {
    description: 'Preview what would be generated without writing files',
  });

  analyzeOnly = Option.Boolean('--analyze-only', false, {
    description: 'Only show codebase analysis, do not generate files',
  });

  verbose = Option.Boolean('--verbose,-v', false, {
    description: 'Show detailed output',
  });

  includeExamples = Option.Boolean('--examples', false, {
    description: 'Include code examples in generated instructions',
  });

  json = Option.Boolean('--json,-j', false, {
    description: 'Output analysis in JSON format',
  });

  directory = Option.String('--dir,-d', {
    description: 'Project directory to analyze (default: current directory)',
  });

  learn = Option.Boolean('--learn,-l', false, {
    description: 'Extract learnable patterns from git history',
  });

  commits = Option.String('--commits', {
    description: 'Number of commits to analyze for learning (default: 100)',
  });

  async execute(): Promise<number> {
    const projectPath = resolve(this.directory || process.cwd());

    if (this.analyzeOnly) {
      return this.runAnalysis(projectPath);
    }

    if (this.learn) {
      return this.runLearn(projectPath);
    }

    return this.runGenerate(projectPath);
  }

  private async runLearn(projectPath: string): Promise<number> {
    step('Analyzing codebase and extracting patterns...\n');

    const analysis = analyzePrimer(projectPath);
    if (this.verbose) {
      this.printAnalysis(analysis);
      console.log();
    }

    console.log(colors.bold('Analyzing git history for patterns...\n'));

    const gitResult = analyzeGitHistory(projectPath, {
      commits: this.commits ? parseInt(this.commits) : 100,
    });

    console.log(`  Commits analyzed: ${gitResult.commitCount}`);
    console.log(`  Languages: ${gitResult.languages.join(', ') || 'N/A'}`);
    console.log(`  Frameworks: ${gitResult.frameworks.join(', ') || 'N/A'}`);
    console.log();

    if (gitResult.patterns.length === 0) {
      warn('No learnable patterns found.');
      return 0;
    }

    console.log(colors.bold(`Extracted ${gitResult.patterns.length} patterns:\n`));

    for (const pattern of gitResult.patterns.slice(0, 10)) {
      const confidence = colors.info(`${(pattern.confidence * 100).toFixed(0)}%`);
      console.log(`  ${colors.muted('○')} ${pattern.title} [${pattern.category}] ${confidence}`);
      addPattern(pattern);
    }

    if (gitResult.patterns.length > 10) {
      console.log(colors.muted(`  ... and ${gitResult.patterns.length - 10} more saved`));
      for (const pattern of gitResult.patterns.slice(10)) {
        addPattern(pattern);
      }
    }

    console.log();
    console.log(colors.success(`✓ Saved ${gitResult.patterns.length} patterns`));
    console.log(colors.muted('View with: skillkit learn --show'));
    console.log(colors.muted('Approve with: skillkit pattern approve <id>'));

    return 0;
  }

  private async runAnalysis(projectPath: string): Promise<number> {
    step('Analyzing codebase...\n');

    try {
      const analysis = analyzePrimer(projectPath);

      if (this.json) {
        console.log(JSON.stringify(analysis, null, 2));
        return 0;
      }

      this.printAnalysis(analysis);
      return 0;
    } catch (err) {
      error('Analysis failed: ' + (err instanceof Error ? err.message : String(err)));
      return 1;
    }
  }

  private async runGenerate(projectPath: string): Promise<number> {
    const agents = this.parseAgents();

    step('Analyzing codebase and generating AI instructions...\n');

    try {
      const result = generatePrimer(projectPath, {
        agents,
        allAgents: this.allAgents,
        outputDir: this.output ? resolve(this.output) : undefined,
        dryRun: this.dryRun,
        verbose: this.verbose,
        includeExamples: this.includeExamples,
      });

      if (this.verbose) {
        this.printAnalysis(result.analysis);
        console.log();
      }

      if (result.generated.length === 0) {
        warn('No instruction files generated.');
        if (result.errors.length > 0) {
          for (const errMsg of result.errors) {
            console.log(colors.error(`  Error: ${errMsg}`));
          }
        }
        return 1;
      }

      console.log(colors.bold('Generated Instruction Files:\n'));

      for (const instruction of result.generated) {
        const status = this.dryRun ? colors.warning('(dry-run)') : colors.success('created');
        console.log(`  ${colors.success('●')} ${colors.bold(instruction.agent)}`);
        console.log(`    ${colors.muted(instruction.filepath)} ${status}`);
      }

      console.log();

      if (result.warnings.length > 0) {
        console.log(colors.warning('Warnings:'));
        for (const warningMsg of result.warnings) {
          console.log(`  ${colors.warning('⚠')} ${warningMsg}`);
        }
        console.log();
      }

      if (result.errors.length > 0) {
        console.log(colors.error('Errors:'));
        for (const errMsg of result.errors) {
          console.log(`  ${colors.error('✗')} ${errMsg}`);
        }
        console.log();
      }

      const summary = this.dryRun
        ? `Would generate ${result.generated.length} instruction file(s)`
        : `Generated ${result.generated.length} instruction file(s)`;

      console.log(colors.bold(summary));

      if (this.dryRun) {
        console.log(colors.muted('\n(Dry run - no files were written)'));
      }

      return result.success ? 0 : 1;
    } catch (err) {
      error('Generation failed: ' + (err instanceof Error ? err.message : String(err)));
      return 1;
    }
  }

  private parseAgents(): AgentType[] | undefined {
    if (!this.agent) return undefined;

    const agents: AgentType[] = [];
    const parts = this.agent.split(',').map(s => s.trim());

    for (const part of parts) {
      const result = AgentTypeSchema.safeParse(part);
      if (result.success) {
        agents.push(result.data);
      } else {
        warn(`Unknown agent: ${part}`);
      }
    }

    return agents.length > 0 ? agents : undefined;
  }

  private printAnalysis(analysis: ReturnType<typeof analyzePrimer>): void {
    const { project, languages, packageManagers, stack, structure, conventions, ci, docker, buildCommands, importantFiles } = analysis;

    console.log(colors.bold('Project Information'));
    console.log(`  Name: ${colors.cyan(project.name)}`);
    if (project.description) {
      console.log(`  Description: ${project.description}`);
    }
    if (project.type) {
      console.log(`  Type: ${project.type}`);
    }
    if (project.version) {
      console.log(`  Version: ${project.version}`);
    }
    console.log();

    if (languages.length > 0) {
      console.log(colors.bold('Languages'));
      for (const lang of languages) {
        const version = lang.version ? ` (${lang.version})` : '';
        console.log(`  ${colors.success('●')} ${lang.name}${version}`);
      }
      console.log();
    }

    if (packageManagers.length > 0) {
      console.log(colors.bold('Package Managers'));
      console.log(`  ${colors.cyan(packageManagers.join(', '))}`);
      console.log();
    }

    if (stack.frameworks.length > 0) {
      console.log(colors.bold('Frameworks'));
      for (const fw of stack.frameworks) {
        const version = fw.version ? ` (${fw.version})` : '';
        console.log(`  ${colors.success('●')} ${fw.name}${version}`);
      }
      console.log();
    }

    if (stack.libraries.length > 0) {
      console.log(colors.bold('Libraries'));
      for (const lib of stack.libraries.slice(0, 10)) {
        const version = lib.version ? ` (${lib.version})` : '';
        console.log(`  ${colors.success('●')} ${lib.name}${version}`);
      }
      if (stack.libraries.length > 10) {
        console.log(`  ${colors.muted(`...and ${stack.libraries.length - 10} more`)}`);
      }
      console.log();
    }

    if (stack.styling.length > 0) {
      console.log(colors.bold('Styling'));
      for (const style of stack.styling) {
        console.log(`  ${colors.success('●')} ${style.name}`);
      }
      console.log();
    }

    if (stack.testing.length > 0) {
      console.log(colors.bold('Testing'));
      for (const test of stack.testing) {
        console.log(`  ${colors.success('●')} ${test.name}`);
      }
      console.log();
    }

    if (stack.databases.length > 0) {
      console.log(colors.bold('Databases'));
      for (const db of stack.databases) {
        console.log(`  ${colors.success('●')} ${db.name}`);
      }
      console.log();
    }

    if (structure) {
      console.log(colors.bold('Project Structure'));
      if (structure.type) {
        console.log(`  Type: ${structure.type}`);
      }
      if (structure.srcDir) {
        console.log(`  Source: ${structure.srcDir}/`);
      }
      if (structure.testDir) {
        console.log(`  Tests: ${structure.testDir}/`);
      }
      if (structure.hasWorkspaces) {
        console.log(`  Monorepo: Yes`);
        if (structure.workspaces) {
          console.log(`  Workspaces: ${structure.workspaces.join(', ')}`);
        }
      }
      console.log();
    }

    if (conventions && Object.keys(conventions).some(k => conventions[k as keyof typeof conventions] !== undefined)) {
      console.log(colors.bold('Code Conventions'));
      if (conventions.indentation) {
        console.log(`  Indentation: ${conventions.indentation}`);
      }
      if (conventions.quotes) {
        console.log(`  Quotes: ${conventions.quotes}`);
      }
      if (conventions.semicolons !== undefined) {
        console.log(`  Semicolons: ${conventions.semicolons ? 'yes' : 'no'}`);
      }
      if (conventions.trailingCommas) {
        console.log(`  Trailing Commas: ${conventions.trailingCommas}`);
      }
      console.log();
    }

    if (ci && ci.hasCI) {
      console.log(colors.bold('CI/CD'));
      console.log(`  Provider: ${ci.provider}`);
      if (ci.hasCD) {
        console.log(`  Deployment: Yes`);
      }
      console.log();
    }

    if (docker && (docker.hasDockerfile || docker.hasCompose)) {
      console.log(colors.bold('Docker'));
      if (docker.hasDockerfile) {
        console.log(`  Dockerfile: Yes`);
        if (docker.baseImage) {
          console.log(`  Base Image: ${docker.baseImage}`);
        }
      }
      if (docker.hasCompose) {
        console.log(`  Docker Compose: Yes`);
      }
      console.log();
    }

    if (buildCommands && Object.keys(buildCommands).some(k => buildCommands[k as keyof typeof buildCommands])) {
      console.log(colors.bold('Build Commands'));
      if (buildCommands.install) {
        console.log(`  Install: ${colors.muted(buildCommands.install)}`);
      }
      if (buildCommands.dev) {
        console.log(`  Dev: ${colors.muted(buildCommands.dev)}`);
      }
      if (buildCommands.build) {
        console.log(`  Build: ${colors.muted(buildCommands.build)}`);
      }
      if (buildCommands.test) {
        console.log(`  Test: ${colors.muted(buildCommands.test)}`);
      }
      console.log();
    }

    if (importantFiles.length > 0 && this.verbose) {
      console.log(colors.bold('Important Files'));
      for (const file of importantFiles.slice(0, 15)) {
        console.log(`  ${colors.muted(file)}`);
      }
      if (importantFiles.length > 15) {
        console.log(`  ${colors.muted(`...and ${importantFiles.length - 15} more`)}`);
      }
      console.log();
    }

    console.log(colors.bold('Available Agents'));
    console.log(colors.muted(`  Use --all-agents to generate for all ${Object.keys(AGENT_CONFIG).length} agents`));
    console.log(colors.muted(`  Use --agent <name> to generate for specific agents`));
  }
}
