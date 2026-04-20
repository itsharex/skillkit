import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AgentAdapter } from './base.js';
import { createSkillXml } from './base.js';
import type { Skill, AgentType } from '@skillkit/core';
import { AGENT_CONFIG } from '@skillkit/core';

const config = AGENT_CONFIG.hermes;

/**
 * Hermes Agent Adapter
 * 
 * Hermes Agent is an advanced AI agent with support for XML-based skills.
 * It uses AGENTS.md for instructions and ~/.hermes/skills/ for global skills.
 */
export class HermesAdapter implements AgentAdapter {
  readonly type: AgentType = 'hermes';
  readonly name = 'Hermes Agent';
  readonly skillsDir = config.skillsDir;
  readonly configFile = config.configFile;

  generateConfig(skills: Skill[]): string {
    const enabledSkills = skills.filter(s => s.enabled);

    if (enabledSkills.length === 0) {
      return '';
    }

    const skillsXml = enabledSkills.map(createSkillXml).join('\n\n');

    return `<skills_system priority="1">

## Available Skills

<!-- SKILLS_TABLE_START -->
<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to use skills:
- Invoke: \`skillkit read <skill-name>\` or \`npx skillkit read <skill-name>\`
- The skill content will load with detailed instructions on how to complete the task
- Base directory provided in output for resolving bundled resources (references/, scripts/, assets/)

Usage notes:
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context
- Each skill invocation is stateless
</usage>

<available_skills>

${skillsXml}

</available_skills>
<!-- SKILLS_TABLE_END -->

</skills_system>`;
  }

  parseConfig(content: string): string[] {
    const startMarker = '<!-- SKILLS_TABLE_START -->';
    const endMarker = '<!-- SKILLS_TABLE_END -->';
    const startIndex = content.indexOf(startMarker);
    const endIndex = content.indexOf(endMarker);

    if (startIndex === -1 || endIndex === -1) {
      return [];
    }

    const scopedContent = content.substring(startIndex + startMarker.length, endIndex);
    const skillNames: string[] = [];
    const skillRegex = /<name>([^<]+)<\/name>/g;
    let match;

    while ((match = skillRegex.exec(scopedContent)) !== null) {
      skillNames.push(match[1].trim());
    }

    return skillNames;
  }

  getInvokeCommand(skillName: string): string {
    return `skillkit read ${skillName}`;
  }

  async isDetected(): Promise<boolean> {
    const projectHermes = join(process.cwd(), '.hermes');
    const globalHermes = join(homedir(), '.hermes');

    return existsSync(projectHermes) || existsSync(globalHermes);
  }
}
