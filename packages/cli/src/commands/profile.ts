import { Command, Option } from 'clipanion';
import { colors, warn, success, error } from '../onboarding/index.js';
import {
  getActiveProfile,
  setActiveProfile,
  getProfile,
  getAllProfiles,
  addCustomProfile,
  removeCustomProfile,
  isBuiltinProfile,
  type ProfileName,
  type OperationalProfile,
} from '@skillkit/core';

export class ProfileCommand extends Command {
  static override paths = [['profile']];

  static override usage = Command.Usage({
    description: 'Manage operational profiles (dev, review, research modes)',
    details: `
      Profiles adjust agent behavior for different tasks.
      Switch between modes like development, code review, or research.
    `,
    examples: [
      ['Show current profile', '$0 profile'],
      ['Switch to review mode', '$0 profile review'],
      ['List all profiles', '$0 profile list'],
    ],
  });

  name = Option.String({ required: false });

  async execute(): Promise<number> {
    if (this.name) {
      const profile = getProfile(this.name as ProfileName);

      if (!profile) {
        error(`Profile not found: ${this.name}`);
        console.log(colors.muted('Run `skillkit profile list` to see available profiles'));
        return 1;
      }

      setActiveProfile(this.name as ProfileName);
      success(`✓ Switched to ${profile.name} mode`);
      console.log(colors.muted(`  Focus: ${profile.focus}`));
      return 0;
    }

    const active = getActiveProfile();
    const profile = getProfile(active);

    console.log(colors.cyan(`Current Profile: ${active}\n`));

    if (profile) {
      console.log(`Description: ${profile.description}`);
      console.log(`Focus: ${profile.focus}`);
      console.log();
      console.log(colors.bold('Behaviors:'));
      for (const behavior of profile.behaviors) {
        console.log(`  • ${behavior}`);
      }
      console.log();
      console.log(colors.bold('Priorities:'));
      console.log(`  ${profile.priorities.join(' > ')}`);

      if (profile.preferredTools?.length) {
        console.log();
        console.log(colors.bold('Preferred Tools:'));
        console.log(`  ${profile.preferredTools.join(', ')}`);
      }

      if (profile.avoidTools?.length) {
        console.log(colors.bold('Avoid Tools:'));
        console.log(`  ${profile.avoidTools.join(', ')}`);
      }
    }

    console.log();
    console.log(colors.muted('Switch with: skillkit profile <name>'));

    return 0;
  }
}

export class ProfileListCommand extends Command {
  static override paths = [['profile', 'list'], ['profile', 'ls']];

  static override usage = Command.Usage({
    description: 'List available profiles',
    examples: [['List profiles', '$0 profile list']],
  });

  json = Option.Boolean('--json,-j', false, {
    description: 'Output as JSON',
  });

  async execute(): Promise<number> {
    const profiles = getAllProfiles();
    const active = getActiveProfile();

    if (this.json) {
      console.log(JSON.stringify({ active, profiles }, null, 2));
      return 0;
    }

    console.log(colors.cyan('Available Profiles:\n'));

    for (const profile of profiles) {
      const isActive = profile.name === active;
      const marker = isActive ? colors.success('●') : colors.muted('○');
      const name = isActive ? colors.bold(profile.name) : profile.name;
      const type = isBuiltinProfile(profile.name) ? '' : colors.muted(' (custom)');

      console.log(`  ${marker} ${name}${type}`);
      console.log(`    ${colors.muted(profile.description)}`);
      console.log(`    Focus: ${profile.focus}`);
      console.log();
    }

    console.log(colors.muted('Switch with: skillkit profile <name>'));

    return 0;
  }
}

export class ProfileCreateCommand extends Command {
  static override paths = [['profile', 'create']];

  static override usage = Command.Usage({
    description: 'Create a custom profile',
    examples: [
      ['Create profile', '$0 profile create --name my-profile --description "My custom profile"'],
    ],
  });

  name = Option.String('--name,-n', {
    description: 'Profile name',
    required: true,
  });

  description = Option.String('--description,-d', {
    description: 'Profile description',
    required: true,
  });

  focus = Option.String('--focus,-f', {
    description: 'Profile focus',
  });

  async execute(): Promise<number> {
    if (isBuiltinProfile(this.name as ProfileName)) {
      error(`Cannot create profile: ${this.name} is a built-in profile`);
      return 1;
    }

    const profile: OperationalProfile = {
      name: this.name as ProfileName,
      description: this.description,
      focus: this.focus || this.description,
      behaviors: [],
      priorities: [],
    };

    addCustomProfile(profile);

    success(`✓ Created profile: ${this.name}`);
    console.log(colors.muted('Edit ~/.skillkit/profiles.yaml to customize'));

    return 0;
  }
}

export class ProfileRemoveCommand extends Command {
  static override paths = [['profile', 'remove'], ['profile', 'rm']];

  static override usage = Command.Usage({
    description: 'Remove a custom profile',
    examples: [['Remove profile', '$0 profile remove my-profile']],
  });

  name = Option.String({ required: true });

  async execute(): Promise<number> {
    if (isBuiltinProfile(this.name as ProfileName)) {
      error(`Cannot remove built-in profile: ${this.name}`);
      return 1;
    }

    const removed = removeCustomProfile(this.name as ProfileName);

    if (!removed) {
      warn(`Profile not found: ${this.name}`);
      return 1;
    }

    success(`✓ Removed profile: ${this.name}`);

    return 0;
  }
}
