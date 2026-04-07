import { Command, Option } from 'clipanion';
import { colors, error, warn } from '../onboarding/index.js';
import {
  ObservationStore,
  LearningStore,
  getMemoryPaths,
  initializeMemoryDirectory,
  getMemoryStatus,
  createMemoryCompressor,
  createMemoryInjector,
  createClaudeMdUpdater,
  syncGlobalClaudeMd,
  createProgressiveDisclosureManager,
  type Learning,
} from '@skillkit/core';

/**
 * Memory command - manage session memory across AI agents
 */
export class MemoryCommand extends Command {
  static override paths = [['memory'], ['mem']];

  static override usage = Command.Usage({
    description: 'Manage session memory across AI coding agents',
    details: `
      The memory command helps you view, search, and manage learnings
      captured from coding sessions across all AI agents.

      Subcommands:
      - status:      Show current memory status
      - search:      Search memories by query
      - list:        List all learnings
      - show:        Show a specific learning
      - compress:    Compress observations into learnings
      - export:      Export a learning as a skill
      - import:      Import memories from another project
      - clear:       Clear session observations
      - add:         Manually add a learning
      - rate:        Rate a learning's effectiveness
      - sync-claude: Sync learnings to CLAUDE.md
      - index:       Show memory index (progressive disclosure)
      - config:      Configure memory settings
    `,
    examples: [
      ['Show memory status', '$0 memory status'],
      ['Search memories', '$0 memory search "authentication"'],
      ['Search global memories', '$0 memory search --global "react hooks"'],
      ['List project learnings', '$0 memory list'],
      ['List global learnings', '$0 memory list --global'],
      ['Show a learning', '$0 memory show <id>'],
      ['Compress observations', '$0 memory compress'],
      ['Export as skill', '$0 memory export <id> --name my-skill'],
      ['Clear session', '$0 memory clear'],
      ['Add manual learning', '$0 memory add --title "..." --content "..."'],
      ['Rate effectiveness', '$0 memory rate <id> 85'],
      ['Sync to CLAUDE.md', '$0 memory sync-claude'],
      ['Show memory index', '$0 memory index'],
    ],
  });

  // Subcommand (status, search, list, show, compress, export, import, clear, add, rate, config)
  action = Option.String({ required: false });

  // Second argument (query for search, id for show/export/rate)
  arg = Option.String({ required: false });

  // Third argument (rating value for rate command)
  ratingArg = Option.String({ required: false });

  // Global scope
  global = Option.Boolean('--global,-g', false, {
    description: 'Use global memories instead of project',
  });

  // Tags filter
  tags = Option.String('--tags,-t', {
    description: 'Filter by tags (comma-separated)',
  });

  // Limit results
  limit = Option.String('--limit,-l', {
    description: 'Maximum number of results',
  });

  // Title for add
  title = Option.String('--title', {
    description: 'Title for new learning',
  });

  // Content for add
  content = Option.String('--content,-c', {
    description: 'Content for new learning',
  });

  // Name for export
  name = Option.String('--name,-n', {
    description: 'Name for exported skill',
  });

  // Output file
  output = Option.String('--output,-o', {
    description: 'Output file path',
  });

  // Input file
  input = Option.String('--input,-i', {
    description: 'Input file path',
  });

  // Keep learnings when clearing
  keepLearnings = Option.Boolean('--keep-learnings', false, {
    description: 'Keep learnings when clearing',
  });

  // Dry run
  dryRun = Option.Boolean('--dry-run', false, {
    description: 'Preview without making changes',
  });

  // JSON output
  json = Option.Boolean('--json,-j', false, {
    description: 'Output in JSON format',
  });

  // Verbose output
  verbose = Option.Boolean('--verbose,-v', false, {
    description: 'Show detailed output',
  });

  async execute(): Promise<number> {
    const action = this.action || 'status';

    switch (action) {
      case 'status':
        return this.showStatus();
      case 'search':
        return this.searchMemories();
      case 'list':
        return this.listLearnings();
      case 'show':
        return this.showLearning();
      case 'compress':
        return this.compressObservations();
      case 'export':
        return this.exportLearning();
      case 'import':
        return this.importMemories();
      case 'clear':
        return this.clearMemory();
      case 'add':
        return this.addLearning();
      case 'rate':
        return this.rateLearning();
      case 'config':
        return this.showConfig();
      case 'sync-claude':
        return this.syncClaudeMd();
      case 'index':
        return this.showIndex();
      default:
        error(`Unknown action: ${action}`);
        console.log(colors.muted('Available actions: status, search, list, show, compress, export, import, clear, add, rate, sync-claude, index, config'));
        return 1;
    }
  }

  /**
   * Show memory status
   */
  private async showStatus(): Promise<number> {
    const projectPath = process.cwd();
    const status = getMemoryStatus(projectPath);
    const paths = getMemoryPaths(projectPath);

    // Get counts from stores
    const observationStore = new ObservationStore(projectPath);
    const projectLearningStore = new LearningStore('project', projectPath);
    const globalLearningStore = new LearningStore('global');

    const sessionObservations = status.hasObservations ? observationStore.count() : 0;
    const projectLearnings = status.hasLearnings ? projectLearningStore.count() : 0;
    const globalLearnings = status.hasGlobalLearnings ? globalLearningStore.count() : 0;
    const sessionId = status.hasObservations ? observationStore.getSessionId() : null;

    if (this.json) {
      console.log(JSON.stringify({
        ...status,
        sessionObservations,
        projectLearnings,
        globalLearnings,
        sessionId,
        paths,
      }, null, 2));
      return 0;
    }

    console.log(colors.bold('\nMemory Status\n'));

    // Session observations
    console.log(colors.cyan('Session:'));
    console.log(`  Observations: ${sessionObservations}`);
    if (sessionId) {
      console.log(`  Session ID: ${colors.muted(sessionId.slice(0, 8))}`);
    }
    console.log();

    // Project learnings
    console.log(colors.cyan('Project:'));
    console.log(`  Learnings: ${projectLearnings}`);
    console.log(`  Path: ${colors.muted(status.projectMemoryExists ? paths.projectMemoryDir : 'Not initialized')}`);
    console.log();

    // Global learnings
    console.log(colors.cyan('Global:'));
    console.log(`  Learnings: ${globalLearnings}`);
    console.log(`  Path: ${colors.muted(status.globalMemoryExists ? paths.globalMemoryDir : 'Not initialized')}`);
    console.log();

    // Recommendations
    if (sessionObservations >= 50) {
      warn('💡 You have many uncompressed observations. Consider running:');
      console.log(colors.muted('   skillkit memory compress'));
    }

    return 0;
  }

  /**
   * Search memories
   */
  private async searchMemories(): Promise<number> {
    const query = this.arg;
    if (!query) {
      error('Error: Search query is required');
      console.log(colors.muted('Usage: skillkit memory search "your query"'));
      return 1;
    }

    const projectPath = process.cwd();
    const injector = createMemoryInjector(projectPath);

    // Validate and parse limit
    let maxLearnings = 10;
    if (this.limit) {
      const parsed = parseInt(this.limit, 10);
      if (isNaN(parsed) || parsed <= 0) {
        console.log(colors.error('Invalid --limit value. Must be a positive number.'));
        return 1;
      }
      maxLearnings = parsed;
    }

    // Sanitize tags - filter out empty strings
    const tags = this.tags
      ?.split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const results = injector.search(query, {
      includeGlobal: this.global,
      tags: tags && tags.length > 0 ? tags : undefined,
      maxLearnings,
      minRelevance: 0,
    });

    if (this.json) {
      console.log(JSON.stringify(results, null, 2));
      return 0;
    }

    if (results.length === 0) {
      console.log(colors.warning(`No memories found for: "${query}"`));
      return 0;
    }

    console.log(colors.bold(`\nFound ${results.length} memories:\n`));

    for (const { learning, relevanceScore, matchedBy } of results) {
      console.log(`${colors.cyan('●')} ${colors.bold(learning.title)}`);
      console.log(`  ID: ${colors.muted(learning.id.slice(0, 8))}`);
      console.log(`  Relevance: ${this.formatScore(relevanceScore)}%`);
      console.log(`  Tags: ${learning.tags.join(', ')}`);
      console.log(`  Scope: ${learning.scope}`);

      if (this.verbose) {
        console.log(`  Matched: ${this.formatMatchedBy(matchedBy)}`);
        console.log(`  Created: ${new Date(learning.createdAt).toLocaleDateString()}`);
        console.log(`  Uses: ${learning.useCount}`);
      }

      // Show excerpt
      const excerpt = learning.content.slice(0, 100);
      console.log(`  ${colors.muted(excerpt)}${learning.content.length > 100 ? '...' : ''}`);
      console.log();
    }

    return 0;
  }

  /**
   * List all learnings
   */
  private async listLearnings(): Promise<number> {
    const projectPath = process.cwd();
    const store = new LearningStore(
      this.global ? 'global' : 'project',
      this.global ? undefined : projectPath
    );

    let learnings = store.getAll();

    // Filter by tags if specified
    if (this.tags) {
      const tagList = this.tags.split(',').map((t) => t.trim().toLowerCase());
      learnings = learnings.filter((l) =>
        l.tags.some((t) => tagList.includes(t.toLowerCase()))
      );
    }

    // Limit results
    const limit = this.limit ? parseInt(this.limit, 10) : learnings.length;
    learnings = learnings.slice(0, limit);

    if (this.json) {
      console.log(JSON.stringify(learnings, null, 2));
      return 0;
    }

    const scope = this.global ? 'Global' : 'Project';
    console.log(colors.bold(`\n${scope} Learnings (${learnings.length}):\n`));

    if (learnings.length === 0) {
      console.log(colors.muted('No learnings found.'));
      console.log(colors.muted('\nCapture learnings by running skills or add manually:'));
      console.log(colors.muted('  skillkit memory add --title "..." --content "..."'));
      return 0;
    }

    for (const learning of learnings) {
      const effectiveness = learning.effectiveness !== undefined
        ? ` [${this.formatScore(learning.effectiveness)}%]`
        : '';

      console.log(`${colors.cyan('●')} ${learning.title}${colors.success(effectiveness)}`);
      console.log(`  ${colors.muted(learning.id.slice(0, 8))} | ${learning.tags.join(', ')} | ${learning.useCount} uses`);

      if (this.verbose) {
        const excerpt = learning.content.slice(0, 80);
        console.log(`  ${colors.muted(excerpt)}${learning.content.length > 80 ? '...' : ''}`);
      }
    }

    console.log();
    return 0;
  }

  /**
   * Show a specific learning
   */
  private async showLearning(): Promise<number> {
    const id = this.arg;
    if (!id) {
      error('Error: Learning ID is required');
      console.log(colors.muted('Usage: skillkit memory show <id>'));
      return 1;
    }

    const projectPath = process.cwd();

    // Try project store first
    let learning = new LearningStore('project', projectPath).getById(id);

    // Try global store
    if (!learning) {
      learning = new LearningStore('global').getById(id);
    }

    // Try matching by prefix
    if (!learning) {
      const projectLearnings = new LearningStore('project', projectPath).getAll();
      const globalLearnings = new LearningStore('global').getAll();
      const all = [...projectLearnings, ...globalLearnings];

      learning = all.find((l) => l.id.startsWith(id));
    }

    if (!learning) {
      error(`Learning not found: ${id}`);
      return 1;
    }

    if (this.json) {
      console.log(JSON.stringify(learning, null, 2));
      return 0;
    }

    console.log(colors.bold(`\n${learning.title}\n`));
    console.log(colors.muted(`ID: ${learning.id}`));
    console.log(colors.muted(`Scope: ${learning.scope}`));
    console.log(colors.muted(`Source: ${learning.source}`));
    console.log(colors.muted(`Tags: ${learning.tags.join(', ')}`));

    if (learning.frameworks?.length) {
      console.log(colors.muted(`Frameworks: ${learning.frameworks.join(', ')}`));
    }

    if (learning.patterns?.length) {
      console.log(colors.muted(`Patterns: ${learning.patterns.join(', ')}`));
    }

    console.log(colors.muted(`Created: ${new Date(learning.createdAt).toLocaleString()}`));
    console.log(colors.muted(`Updated: ${new Date(learning.updatedAt).toLocaleString()}`));
    console.log(colors.muted(`Uses: ${learning.useCount}`));

    if (learning.effectiveness !== undefined) {
      console.log(colors.muted(`Effectiveness: ${this.formatScore(learning.effectiveness)}%`));
    }

    console.log(colors.bold('\nContent:\n'));
    console.log(learning.content);
    console.log();

    return 0;
  }

  /**
   * Compress observations into learnings
   */
  private async compressObservations(): Promise<number> {
    const projectPath = process.cwd();

    // Initialize memory directory if needed
    initializeMemoryDirectory(projectPath);

    const observationStore = new ObservationStore(projectPath);
    const observations = observationStore.getAll();

    if (observations.length === 0) {
      console.log(colors.warning('No observations to compress.'));
      return 0;
    }

    console.log(colors.cyan(`Found ${observations.length} observations to compress...\n`));

    const compressor = createMemoryCompressor(projectPath);
    const compressionOptions = {
      minObservations: 2,
      additionalTags: this.tags?.split(',').map((t) => t.trim()),
    };

    if (this.dryRun) {
      console.log(colors.muted('(Dry run - no changes will be made)\n'));

      // For dry-run, only compress without storing
      const result = await compressor.compress(observations, compressionOptions);

      console.log(colors.success(`✓ Would compress ${result.stats.inputCount} observations into ${result.stats.outputCount} learnings\n`));

      if (result.learnings.length > 0) {
        console.log(colors.bold('Learnings that would be created:'));
        for (const learning of result.learnings) {
          console.log(`  ${colors.cyan('●')} ${learning.title}`);
          console.log(`    Tags: ${learning.tags.join(', ')}`);
        }
        console.log();
      }

      return 0;
    }

    // Actual compression with storage
    const { learnings, result } = await compressor.compressAndStore(observations, compressionOptions);

    console.log(colors.success(`✓ Compressed ${result.stats.inputCount} observations into ${result.stats.outputCount} learnings\n`));

    if (learnings.length > 0) {
      console.log(colors.bold('New Learnings:'));
      for (const learning of learnings) {
        console.log(`  ${colors.cyan('●')} ${learning.title}`);
        console.log(`    Tags: ${learning.tags.join(', ')}`);
      }
      console.log();
    }

    if (result.processedObservationIds.length > 0) {
      // Remove processed observations
      const deleted = observationStore.deleteMany(result.processedObservationIds);
      console.log(colors.muted(`Cleared ${deleted} processed observations.`));
    }

    return 0;
  }

  /**
   * Export a learning as a skill
   */
  private async exportLearning(): Promise<number> {
    const id = this.arg;
    if (!id) {
      error('Error: Learning ID is required');
      console.log(colors.muted('Usage: skillkit memory export <id> --name my-skill'));
      return 1;
    }

    const projectPath = process.cwd();

    // Find the learning
    let learning = new LearningStore('project', projectPath).getById(id);
    if (!learning) {
      learning = new LearningStore('global').getById(id);
    }

    // Try matching by prefix
    if (!learning) {
      const projectLearnings = new LearningStore('project', projectPath).getAll();
      const globalLearnings = new LearningStore('global').getAll();
      const all = [...projectLearnings, ...globalLearnings];
      learning = all.find((l) => l.id.startsWith(id));
    }

    if (!learning) {
      error(`Learning not found: ${id}`);
      return 1;
    }

    // Generate skill name
    const skillName = this.name || this.slugify(learning.title);

    // Generate skill content
    const skillContent = this.generateSkillContent(learning, skillName);

    if (this.dryRun) {
      console.log(colors.muted('(Dry run preview)\n'));
      console.log(skillContent);
      return 0;
    }

    // Determine output path
    const outputPath = this.output || `.skillkit/exports/${skillName}/SKILL.md`;
    const { dirname } = await import('node:path');
    const { existsSync, mkdirSync, writeFileSync } = await import('node:fs');

    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    writeFileSync(outputPath, skillContent, 'utf-8');

    console.log(colors.success(`✓ Exported learning as skill: ${skillName}`));
    console.log(colors.muted(`  Path: ${outputPath}`));

    return 0;
  }

  /**
   * Import memories from another project
   */
  private async importMemories(): Promise<number> {
    const inputPath = this.input || this.arg;
    if (!inputPath) {
      error('Error: Input path is required');
      console.log(colors.muted('Usage: skillkit memory import --input <path>'));
      return 1;
    }

    const { existsSync, readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');

    const fullPath = resolve(inputPath);
    if (!existsSync(fullPath)) {
      error(`File not found: ${fullPath}`);
      return 1;
    }

    const projectPath = process.cwd();
    const store = new LearningStore(
      this.global ? 'global' : 'project',
      this.global ? undefined : projectPath
    );

    try {
      const content = readFileSync(fullPath, 'utf-8');
      const { parse: parseYaml } = await import('yaml');
      const data = parseYaml(content) as { learnings?: Learning[] };

      if (!data.learnings || !Array.isArray(data.learnings)) {
        error('Invalid memory file format');
        return 1;
      }

      let imported = 0;
      for (const learning of data.learnings) {
        if (this.dryRun) {
          console.log(colors.muted(`Would import: ${learning.title}`));
        } else {
          store.add({
            source: 'imported',
            title: learning.title,
            content: learning.content,
            // Default to empty arrays if not present in imported YAML
            tags: Array.isArray(learning.tags) ? learning.tags : [],
            frameworks: Array.isArray(learning.frameworks) ? learning.frameworks : [],
            patterns: Array.isArray(learning.patterns) ? learning.patterns : [],
          });
          imported++;
        }
      }

      if (this.dryRun) {
        console.log(colors.muted(`\n(Dry run - ${data.learnings.length} learnings would be imported)`));
      } else {
        console.log(colors.success(`✓ Imported ${imported} learnings`));
      }

      return 0;
    } catch (err) {
      error(`Import failed: ${err}`);
      return 1;
    }
  }

  /**
   * Clear session observations
   */
  private async clearMemory(): Promise<number> {
    const projectPath = process.cwd();

    if (this.dryRun) {
      const observationStore = new ObservationStore(projectPath);
      const learningStore = new LearningStore('project', projectPath);

      console.log(colors.muted('(Dry run preview)\n'));
      console.log(`Would clear ${observationStore.count()} observations`);
      if (!this.keepLearnings) {
        console.log(`Would clear ${learningStore.count()} learnings`);
      }
      return 0;
    }

    const observationStore = new ObservationStore(projectPath);
    observationStore.clear();
    console.log(colors.success('✓ Cleared session observations'));

    if (!this.keepLearnings) {
      const learningStore = new LearningStore('project', projectPath);
      learningStore.clear();
      console.log(colors.success('✓ Cleared project learnings'));
    }

    return 0;
  }

  /**
   * Add a manual learning
   */
  private async addLearning(): Promise<number> {
    if (!this.title) {
      error('Error: --title is required');
      console.log(colors.muted('Usage: skillkit memory add --title "..." --content "..."'));
      return 1;
    }

    if (!this.content) {
      error('Error: --content is required');
      console.log(colors.muted('Usage: skillkit memory add --title "..." --content "..."'));
      return 1;
    }

    const projectPath = process.cwd();
    const store = new LearningStore(
      this.global ? 'global' : 'project',
      this.global ? undefined : projectPath
    );

    const tags = this.tags?.split(',').map((t) => t.trim()) || [];

    const learning = store.add({
      source: 'manual',
      title: this.title,
      content: this.content,
      tags,
    });

    console.log(colors.success(`✓ Added learning: ${learning.title}`));
    console.log(colors.muted(`  ID: ${learning.id}`));

    return 0;
  }

  /**
   * Rate a learning's effectiveness
   */
  private async rateLearning(): Promise<number> {
    const id = this.arg;
    if (!id) {
      error('Error: Learning ID is required');
      console.log(colors.muted('Usage: skillkit memory rate <id> <rating>'));
      return 1;
    }

    const rating = parseInt(this.ratingArg || '0', 10);
    if (isNaN(rating) || rating < 0 || rating > 100) {
      error('Error: Rating must be 0-100');
      console.log(colors.muted('Usage: skillkit memory rate <id> <rating>'));
      return 1;
    }

    const projectPath = process.cwd();

    // Try project store first
    const projectStore = new LearningStore('project', projectPath);
    let learning = projectStore.getById(id);
    let store = projectStore;

    if (!learning) {
      const globalStore = new LearningStore('global');
      learning = globalStore.getById(id);
      store = globalStore;
    }

    // Try prefix match
    if (!learning) {
      const projectLearnings = projectStore.getAll();
      const globalStore = new LearningStore('global');
      const globalLearnings = globalStore.getAll();

      learning = projectLearnings.find((l) => l.id.startsWith(id));
      if (learning) {
        store = projectStore;
      } else {
        learning = globalLearnings.find((l) => l.id.startsWith(id));
        if (learning) {
          store = globalStore;
        }
      }
    }

    if (!learning) {
      error(`Learning not found: ${id}`);
      return 1;
    }

    store.setEffectiveness(learning.id, rating);
    console.log(colors.success(`✓ Rated "${learning.title}" as ${rating}% effective`));

    return 0;
  }

  /**
   * Show memory configuration
   */
  private async showConfig(): Promise<number> {
    const projectPath = process.cwd();
    const paths = getMemoryPaths(projectPath);

    if (this.json) {
      console.log(JSON.stringify(paths, null, 2));
      return 0;
    }

    console.log(colors.bold('\nMemory Configuration\n'));

    console.log(colors.cyan('Paths:'));
    console.log(`  Project observations: ${colors.muted(paths.observationsFile)}`);
    console.log(`  Project learnings: ${colors.muted(paths.learningsFile)}`);
    console.log(`  Project index: ${colors.muted(paths.indexFile)}`);
    console.log(`  Global learnings: ${colors.muted(paths.globalLearningsFile)}`);
    console.log(`  Global index: ${colors.muted(paths.globalIndexFile)}`);
    console.log();

    return 0;
  }

  /**
   * Sync learnings to CLAUDE.md
   */
  private async syncClaudeMd(): Promise<number> {
    const projectPath = process.cwd();

    if (this.global) {
      if (this.dryRun) {
        console.log(colors.muted('(Dry run - previewing global CLAUDE.md sync)\n'));
      }

      const result = this.dryRun
        ? { updated: false, path: '~/.claude/CLAUDE.md', learningsAdded: 0, learningSummaries: [], previousLearnings: 0 }
        : syncGlobalClaudeMd({ minEffectiveness: 60 });

      if (this.dryRun) {
        const globalStore = new LearningStore('global');
        const learnings = globalStore.getAll()
          .filter((l) => (l.effectiveness ?? 0) >= 60 || l.useCount >= 3)
          .slice(0, 20);
        console.log(colors.cyan(`Would add ${learnings.length} learnings to global CLAUDE.md`));
        for (const l of learnings.slice(0, 5)) {
          console.log(`  ${colors.muted('●')} ${l.title}`);
        }
        if (learnings.length > 5) {
          console.log(colors.muted(`  ... and ${learnings.length - 5} more`));
        }
        return 0;
      }

      if (result.updated) {
        console.log(colors.success(`✓ Updated global CLAUDE.md with ${result.learningsAdded} learnings`));
        console.log(colors.muted(`  Path: ${result.path}`));
      } else {
        console.log(colors.warning('No learnings to sync to global CLAUDE.md'));
      }

      return 0;
    }

    const updater = createClaudeMdUpdater(projectPath);

    if (this.dryRun) {
      const preview = updater.preview({ minEffectiveness: 60 });

      console.log(colors.muted('(Dry run preview)\n'));

      if (!preview.wouldUpdate) {
        console.log(colors.warning('No learnings to sync to CLAUDE.md'));
        return 0;
      }

      console.log(colors.cyan(`Would add ${preview.learnings.length} learnings to CLAUDE.md\n`));

      for (const learning of preview.learnings.slice(0, 5)) {
        console.log(`  ${colors.muted('●')} ${learning.title}`);
      }

      if (preview.learnings.length > 5) {
        console.log(colors.muted(`  ... and ${preview.learnings.length - 5} more`));
      }

      console.log(colors.bold('\nFormatted section preview:'));
      console.log(colors.muted('─'.repeat(50)));
      console.log(preview.formattedSection.slice(0, 500));
      if (preview.formattedSection.length > 500) {
        console.log(colors.muted('...'));
      }

      return 0;
    }

    const result = updater.update({ minEffectiveness: 60 });

    if (result.updated) {
      console.log(colors.success(`✓ Updated CLAUDE.md with ${result.learningsAdded} learnings`));
      console.log(colors.muted(`  Path: ${result.path}`));

      if (this.verbose && result.learningSummaries.length > 0) {
        console.log(colors.cyan('\nLearnings added:'));
        for (const title of result.learningSummaries.slice(0, 10)) {
          console.log(`  ${colors.muted('●')} ${title}`);
        }
      }
    } else {
      console.log(colors.warning('No learnings to sync to CLAUDE.md'));
    }

    return 0;
  }

  /**
   * Show memory index (progressive disclosure Layer 1)
   */
  private async showIndex(): Promise<number> {
    const projectPath = process.cwd();
    const manager = createProgressiveDisclosureManager(projectPath);

    let maxResults = 50;
    if (this.limit) {
      const parsed = parseInt(this.limit, 10);
      if (isNaN(parsed) || parsed <= 0) {
        console.log(colors.error('Invalid --limit value. Must be a positive number.'));
        return 1;
      }
      maxResults = parsed;
    }

    const index = manager.getIndex({ includeGlobal: this.global, maxResults });

    if (this.json) {
      console.log(JSON.stringify(index, null, 2));
      return 0;
    }

    console.log(colors.bold(`\nMemory Index (${index.length} entries)\n`));

    if (index.length === 0) {
      console.log(colors.muted('No learnings found.'));
      return 0;
    }

    const displayLimit = this.limit ? parseInt(this.limit, 10) : 20;
    const displayed = index.slice(0, displayLimit);

    for (const entry of displayed) {
      const effectiveness = entry.effectiveness !== undefined
        ? ` [${this.formatScore(entry.effectiveness)}%]`
        : '';
      const scope = entry.scope === 'global' ? colors.magenta('[G]') : colors.info('[P]');

      console.log(`${scope} ${colors.muted(entry.id.slice(0, 8))} ${entry.title}${colors.success(effectiveness)}`);
      console.log(`   Tags: ${entry.tags.join(', ')} | Uses: ${entry.useCount}`);
    }

    if (index.length > displayLimit) {
      console.log(colors.muted(`\n... and ${index.length - displayLimit} more (use --limit to show more)`));
    }

    console.log(colors.muted('\nUse "skillkit memory show <id>" to view full details'));

    return 0;
  }

  /**
   * Format relevance/effectiveness score with color
   */
  private formatScore(score: number): string {
    if (score >= 80) return colors.success(score.toString());
    if (score >= 50) return colors.warning(score.toString());
    return colors.error(score.toString());
  }

  /**
   * Format matched by info
   */
  private formatMatchedBy(matchedBy: {
    frameworks: string[];
    tags: string[];
    keywords: string[];
    patterns: string[];
  }): string {
    const parts: string[] = [];
    if (matchedBy.frameworks.length > 0) {
      parts.push(`frameworks: ${matchedBy.frameworks.join(', ')}`);
    }
    if (matchedBy.tags.length > 0) {
      parts.push(`tags: ${matchedBy.tags.join(', ')}`);
    }
    if (matchedBy.keywords.length > 0) {
      parts.push(`keywords: ${matchedBy.keywords.slice(0, 3).join(', ')}`);
    }
    if (matchedBy.patterns.length > 0) {
      parts.push(`patterns: ${matchedBy.patterns.join(', ')}`);
    }
    return parts.join(' | ') || 'general';
  }

  /**
   * Convert title to slug
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
  }

  /**
   * Escape a YAML scalar value if it contains special characters
   */
  private escapeYamlValue(value: string): string {
    // Check if value needs quoting (contains special YAML characters)
    if (/[:#\[\]{}|>&*!?,'"\\@`]/.test(value) || value.includes('\n')) {
      // Use double quotes and escape internal quotes/backslashes
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return value;
  }

  /**
   * Generate skill content from learning
   */
  private generateSkillContent(learning: Learning, skillName: string): string {
    // Escape values that might contain special YAML characters
    const escapedName = this.escapeYamlValue(skillName);
    const escapedDesc = this.escapeYamlValue(learning.title);
    const escapedTags = learning.tags.map((t) => this.escapeYamlValue(t));

    const lines: string[] = [
      '---',
      `name: ${escapedName}`,
      `description: ${escapedDesc}`,
      `version: 1.0.0`,
      `tags: [${escapedTags.join(', ')}]`,
      `source: skillkit-memory`,
      `sourceType: local`,
    ];

    if (learning.frameworks?.length) {
      const escapedFrameworks = learning.frameworks.map((f) => this.escapeYamlValue(f));
      lines.push(`compatibility:`);
      lines.push(`  frameworks: [${escapedFrameworks.join(', ')}]`);
    }

    lines.push('---', '', `# ${learning.title}`, '');

    if (learning.patterns?.length) {
      lines.push(`## Patterns`, '');
      for (const pattern of learning.patterns) {
        lines.push(`- ${pattern}`);
      }
      lines.push('');
    }

    lines.push(`## Content`, '', learning.content, '');

    lines.push(
      '---',
      '',
      '*Exported from SkillKit session memory*',
      `*Created: ${new Date(learning.createdAt).toLocaleDateString()}*`,
      `*Uses: ${learning.useCount}*`
    );

    if (learning.effectiveness !== undefined) {
      lines.push(`*Effectiveness: ${learning.effectiveness}%*`);
    }

    return lines.join('\n');
  }
}
