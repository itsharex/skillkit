import { Command, Option } from 'clipanion';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { colors, warn, success, error, spinner } from '../onboarding/index.js';
import {
  type AgentType,
  translateSkill,
  translateSkillFile,
  getSupportedTranslationAgents,
  translatorRegistry,
  findAllSkills,
} from '@skillkit/core';
import { getAdapter, getAllAdapters } from '@skillkit/agents';
import { getSearchDirs } from '../helpers.js';

/**
 * Translate skills between different AI agent formats
 */
export class TranslateCommand extends Command {
  static override paths = [['translate']];

  static override usage = Command.Usage({
    description: 'Translate skills between different AI agent formats',
    details: `
      This command translates skills from one AI agent format to another.

      Supported formats:
      - SKILL.md (Claude Code, Codex, Gemini CLI, and 10+ more)
      - Cursor MDC (.mdc files with globs)
      - Windsurf rules (.windsurfrules)
      - GitHub Copilot instructions (copilot-instructions.md)

      Translation is bidirectional - you can translate from any format to any other.
    `,
    examples: [
      ['Translate a skill to Cursor format', '$0 translate my-skill --to cursor'],
      ['Translate all skills to Windsurf', '$0 translate --all --to windsurf'],
      ['Translate a file directly', '$0 translate ./SKILL.md --to cursor --output ./my-skill.mdc'],
      ['List all supported agents', '$0 translate --list'],
      ['Preview translation without writing', '$0 translate my-skill --to cursor --dry-run'],
    ],
  });

  // Skill name or path
  source = Option.String({ required: false });

  // Target agent
  to = Option.String('--to,-t', {
    description: 'Target agent to translate to',
  });

  // Source agent (auto-detected if not specified)
  from = Option.String('--from,-f', {
    description: 'Source agent format (auto-detected if not specified)',
  });

  // Output path
  output = Option.String('--output,-o', {
    description: 'Output file path (default: agent skills directory)',
  });

  // Translate all installed skills
  all = Option.Boolean('--all,-a', false, {
    description: 'Translate all installed skills',
  });

  // Dry run (preview without writing)
  dryRun = Option.Boolean('--dry-run,-n', false, {
    description: 'Preview translation without writing files',
  });

  // Add metadata comments
  metadata = Option.Boolean('--metadata,-m', false, {
    description: 'Add translation metadata to output',
  });

  // Force overwrite
  force = Option.Boolean('--force', false, {
    description: 'Overwrite existing files',
  });

  // List supported agents
  list = Option.Boolean('--list,-l', false, {
    description: 'List all supported agents and formats',
  });

  // Show compatibility info
  compat = Option.Boolean('--compat,-c', false, {
    description: 'Show compatibility info between agents',
  });

  async execute(): Promise<number> {
    // List supported agents
    if (this.list) {
      return this.listAgents();
    }

    // Show compatibility info
    if (this.compat) {
      return this.showCompatibility();
    }

    // Validate target agent
    if (!this.to) {
      error('--to/-t target agent is required');
      console.log(colors.muted('Use --list to see all supported agents'));
      return 1;
    }

    const targetAgent = this.to as AgentType;
    if (!getSupportedTranslationAgents().includes(targetAgent)) {
      error(`Unknown target agent "${this.to}"`);
      console.log(colors.muted('Use --list to see all supported agents'));
      return 1;
    }

    // Translate all skills
    if (this.all) {
      return this.translateAll(targetAgent);
    }

    // Translate single skill
    if (!this.source) {
      error('Please specify a skill name or path, or use --all');
      return 1;
    }

    return this.translateSingle(this.source, targetAgent);
  }

  /**
   * List all supported agents and their formats
   */
  private listAgents(): number {
    console.log(colors.bold('\nSupported Agents for Translation:\n'));

    const agents = getSupportedTranslationAgents();
    const adapters = getAllAdapters();

    // Group by format
    const byFormat: Record<string, AgentType[]> = {};
    for (const agent of agents) {
      const format = translatorRegistry.getFormatForAgent(agent);
      if (!byFormat[format]) byFormat[format] = [];
      byFormat[format].push(agent);
    }

    // Display by format
    const formatNames: Record<string, string> = {
      'skill-md': 'SKILL.md Format (Standard)',
      'cursor-mdc': 'Cursor MDC Format',
      'markdown-rules': 'Markdown Rules Format',
      'external': 'External Systems',
    };

    for (const [format, formatAgents] of Object.entries(byFormat)) {
      console.log(colors.cyan(`  ${formatNames[format] || format}:`));
      for (const agent of formatAgents) {
        const adapter = adapters.find(a => a.type === agent);
        const name = adapter?.name || agent;
        console.log(`    ${colors.success(agent.padEnd(16))} ${colors.muted(name)}`);
      }
      console.log();
    }

    console.log(colors.muted('All formats can translate to any other format.'));
    console.log(colors.muted('Use --compat to see compatibility details.\n'));

    return 0;
  }

  /**
   * Show compatibility between agents
   */
  private showCompatibility(): number {
    if (!this.from || !this.to) {
      error('Both --from and --to are required for compatibility check');
      return 1;
    }

    const fromAgent = this.from as AgentType;
    const toAgent = this.to as AgentType;

    const info = translatorRegistry.getCompatibilityInfo(fromAgent, toAgent);

    console.log(colors.bold(`\nTranslation: ${fromAgent} → ${toAgent}\n`));

    if (info.supported) {
      console.log(colors.success('  ✓ Translation supported'));
    } else {
      console.log(colors.error('  ✗ Translation not supported'));
      return 1;
    }

    if (info.warnings.length > 0) {
      warn('\n  Warnings:');
      for (const warning of info.warnings) {
        console.log(colors.warning(`    • ${warning}`));
      }
    }

    if (info.lossyFields.length > 0) {
      console.log(colors.muted('\n  Fields with reduced functionality:'));
      for (const field of info.lossyFields) {
        console.log(colors.muted(`    • ${field}`));
      }
    }

    console.log();
    return 0;
  }

  /**
   * Translate all installed skills
   */
  private async translateAll(targetAgent: AgentType): Promise<number> {
    const searchDirs = getSearchDirs();
    const skills = findAllSkills(searchDirs);

    if (skills.length === 0) {
      warn('No skills found to translate');
      return 0;
    }

    console.log(colors.bold(`\nTranslating ${skills.length} skill(s) to ${targetAgent}...\n`));

    let successCount = 0;
    let failed = 0;
    const s = spinner();

    for (const skill of skills) {
      const skillMdPath = join(skill.path, 'SKILL.md');
      if (!existsSync(skillMdPath)) {
        warn(`  ⚠ ${skill.name}: No SKILL.md found`);
        failed++;
        continue;
      }

      s.start(`Translating ${skill.name}...`);

      const result = translateSkillFile(skillMdPath, targetAgent, {
        addMetadata: this.metadata,
      });

      s.stop(`Translated ${skill.name}`);

      if (result.success) {
        if (this.dryRun) {
          success(`  ✓ ${skill.name} → ${result.filename} (dry run)`);
          if (result.warnings.length > 0) {
            for (const warning of result.warnings) {
              console.log(colors.muted(`      ${warning}`));
            }
          }
        } else {
          // Determine output path
          const targetAdapter = getAdapter(targetAgent);
          const outputDir = this.output || join(process.cwd(), targetAdapter.skillsDir, skill.name);

          if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
          }

          const outputPath = join(outputDir, result.filename);

          if (existsSync(outputPath) && !this.force) {
            warn(`  ⚠ ${skill.name}: ${outputPath} exists (use --force)`);
            failed++;
            continue;
          }

          writeFileSync(outputPath, result.content, 'utf-8');
          success(`  ✓ ${skill.name} → ${outputPath}`);
        }

        if (result.incompatible.length > 0) {
          for (const item of result.incompatible) {
            console.log(colors.muted(`      ⚠ ${item}`));
          }
        }

        successCount++;
      } else {
        console.log(colors.error(`  ✗ ${skill.name}: Translation failed`));
        for (const item of result.incompatible) {
          console.log(colors.error(`      ${item}`));
        }
        failed++;
      }
    }

    console.log();
    console.log(colors.bold(`Translated: ${successCount}, Failed: ${failed}`));

    return failed > 0 ? 1 : 0;
  }

  /**
   * Translate a single skill
   */
  private async translateSingle(source: string, targetAgent: AgentType): Promise<number> {
    let sourcePath: string;
    let skillName: string;

    // Check if source is a file path
    if (existsSync(source)) {
      sourcePath = source;
      skillName = basename(dirname(source));
      if (skillName === '.') {
        skillName = basename(source).replace(/\.(md|mdc)$/i, '');
      }
    } else {
      // Search for skill by name
      const searchDirs = getSearchDirs();
      let found = false;

      for (const dir of searchDirs) {
        const skillPath = join(dir, source);
        const skillMdPath = join(skillPath, 'SKILL.md');

        if (existsSync(skillMdPath)) {
          sourcePath = skillMdPath;
          skillName = source;
          found = true;
          break;
        }
      }

      if (!found) {
        error(`Skill "${source}" not found`);
        console.log(colors.muted('Searched in:'));
        for (const dir of searchDirs) {
          console.log(colors.muted(`  ${dir}`));
        }
        return 1;
      }
    }

    // Read and translate
    const s = spinner();
    s.start(`Translating to ${targetAgent}...`);

    const content = readFileSync(sourcePath!, 'utf-8');
    const result = translateSkill(content, targetAgent, {
      addMetadata: this.metadata,
      sourceFilename: basename(sourcePath!),
    });

    s.stop(`Translation complete`);

    if (!result.success) {
      error('Translation failed:');
      for (const item of result.incompatible) {
        console.log(colors.muted(`  ${item}`));
      }
      return 1;
    }

    // Show warnings
    if (result.warnings.length > 0) {
      warn('\nWarnings:');
      for (const warning of result.warnings) {
        console.log(colors.warning(`  • ${warning}`));
      }
    }

    // Show incompatible features
    if (result.incompatible.length > 0) {
      console.log(colors.muted('\nIncompatible features:'));
      for (const item of result.incompatible) {
        console.log(colors.muted(`  • ${item}`));
      }
    }

    // Dry run - just show preview
    if (this.dryRun) {
      console.log(colors.bold(`\nTranslated content (${result.filename}):\n`));
      console.log(colors.muted('─'.repeat(60)));
      console.log(result.content);
      console.log(colors.muted('─'.repeat(60)));
      return 0;
    }

    // Determine output path
    let outputPath: string;
    if (this.output) {
      outputPath = this.output;
    } else {
      const targetAdapter = getAdapter(targetAgent);
      const outputDir = join(process.cwd(), targetAdapter.skillsDir, skillName!);

      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      outputPath = join(outputDir, result.filename);
    }

    // Check for existing file
    if (existsSync(outputPath) && !this.force) {
      error(`${outputPath} already exists`);
      console.log(colors.muted('Use --force to overwrite'));
      return 1;
    }

    // Write output
    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    writeFileSync(outputPath, result.content, 'utf-8');

    success(`\n✓ Translated to ${outputPath}`);
    console.log(colors.muted(`  Format: ${result.targetFormat}`));
    console.log(colors.muted(`  Agent: ${result.targetAgent}`));

    return 0;
  }
}
