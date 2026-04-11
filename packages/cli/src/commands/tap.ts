import { Command, Option } from 'clipanion';
import { colors, symbols, step, success, warn } from '../onboarding/index.js';
import { loadTaps, saveTaps } from '../helpers.js';

export class TapAddCommand extends Command {
  static override paths = [['tap', 'add']];

  static override usage = Command.Usage({
    description: 'Add a custom skill source (tap)',
    examples: [
      ['Add a GitHub source', '$0 tap add myorg/skills'],
      ['Add with a display name', '$0 tap add myorg/skills --name "My Org Skills"'],
    ],
  });

  source = Option.String({ required: true });

  name = Option.String('--name,-n', {
    description: 'Display name for the tap',
  });

  async execute(): Promise<number> {
    const taps = loadTaps();

    const exists = taps.taps.some((t) => t.source === this.source);
    if (exists) {
      warn(`Tap already exists: ${this.source}`);
      return 0;
    }

    taps.taps.push({
      source: this.source,
      name: this.name,
      addedAt: new Date().toISOString(),
    });
    saveTaps(taps);

    success(`Added tap: ${this.source}${this.name ? ` (${this.name})` : ''}`);
    console.log(colors.muted('Skills from this source will appear in search results'));
    return 0;
  }
}

export class TapRemoveCommand extends Command {
  static override paths = [['tap', 'remove'], ['tap', 'rm']];

  static override usage = Command.Usage({
    description: 'Remove a custom skill source (tap)',
    examples: [
      ['Remove a tap', '$0 tap remove myorg/skills'],
    ],
  });

  source = Option.String({ required: true });

  async execute(): Promise<number> {
    const taps = loadTaps();

    const idx = taps.taps.findIndex((t) => t.source === this.source);
    if (idx === -1) {
      warn(`Tap not found: ${this.source}`);
      return 0;
    }

    taps.taps.splice(idx, 1);
    saveTaps(taps);

    success(`Removed tap: ${this.source}`);
    return 0;
  }
}

export class TapListCommand extends Command {
  static override paths = [['tap', 'list'], ['tap', 'ls'], ['tap']];

  static override usage = Command.Usage({
    description: 'List all custom skill sources (taps)',
    examples: [
      ['List taps', '$0 tap list'],
    ],
  });

  async execute(): Promise<number> {
    const taps = loadTaps();

    if (taps.taps.length === 0) {
      step('No custom taps configured');
      console.log(colors.muted('Add one with: skillkit tap add owner/repo'));
      return 0;
    }

    step(`${taps.taps.length} tap(s) configured`);
    console.log('');

    for (const tap of taps.taps) {
      const label = tap.name ? `${tap.name} (${tap.source})` : tap.source;
      console.log(`  ${colors.success(symbols.bullet)} ${colors.primary(label)}`);
      if (tap.addedAt) {
        console.log(`    ${colors.muted(`Added: ${tap.addedAt}`)}`);
      }
    }

    console.log('');
    return 0;
  }
}
