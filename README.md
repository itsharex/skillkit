<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/img/banner.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/img/banner.svg">
  <img alt="SkillKit - One Skill. Every Agent." src="docs/img/banner.svg" width="100%">
</picture>

<br/>
<br/>

[![CI](https://github.com/rohitg00/skillkit/actions/workflows/ci.yml/badge.svg)](https://github.com/rohitg00/skillkit/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/skillkit.svg?style=flat-square&color=3b82f6)](https://www.npmjs.com/package/skillkit)
[![npm downloads](https://img.shields.io/npm/dm/skillkit.svg?style=flat-square)](https://www.npmjs.com/package/skillkit)
[![GitHub stars](https://img.shields.io/github/stars/rohitg00/skillkit?style=flat-square)](https://github.com/rohitg00/skillkit/stargazers)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat-square)](https://opensource.org/licenses/Apache-2.0)

**SkillKit** is the open source package manager for AI agent skills. Write a skill once, deploy it to **45 agents** — Claude, Cursor, Copilot, Windsurf, Devin, Codex, and 39 more. No rewrites. 400K+ skills across registries.

[Website](https://skillkit.sh) &middot; [Docs](https://skillkit.sh/docs) &middot; [API Explorer](https://skillkit.sh/api) &middot; [Chrome Extension](https://github.com/rohitg00/skillkit/tree/main/packages/extension#readme) &middot; [npm](https://www.npmjs.com/package/skillkit)

</div>

---
https://github.com/user-attachments/assets/b1843a07-2c54-422d-8903-f30a790cfb37

Skills make AI coding agents smarter. But every agent uses a different format:

| Agent | Format | Directory |
|-------|--------|-----------|
| Claude Code | `SKILL.md` | `.claude/skills/` |
| Cursor | `.mdc` | `.cursor/skills/` |
| Copilot | Markdown | `.github/skills/` |
| Windsurf | Markdown | `.windsurf/skills/` |

You end up rewriting the same skill for each agent, or locking into one platform.

**SkillKit fixes this.** Install from 400K+ skills across registries, auto-translate between formats, persist learnings with Memory. Works with Claude, Cursor, Windsurf, Copilot, and 41 more.

```bash
npx skillkit@latest
```

## See It In Action

<div align="center">

![SkillKit vs skills CLI](docs/img/inital-command.png)

</div>

> **New in v1.20.0:** Live download progress, sparse checkout for monorepos (~1.4s for large repos), and `skillkit remove --source` to bulk-remove by repo.

## Quick Start

```bash
npx skillkit@latest init              # Detect agents, create dirs
skillkit recommend                    # Get smart suggestions
skillkit install anthropics/skills    # Install from marketplace
skillkit sync                         # Deploy to your agents
```

Four commands. Your agents now have skills for PDF processing, code review, and more.

## What Can You Do?

### Install skills from anywhere

```bash
skillkit install anthropics/skills          # GitHub
skillkit install gitlab:team/skills         # GitLab
skillkit install ./my-local-skills          # Local path
```

### Translate between agents

Write for Claude, deploy to Cursor:

```bash
skillkit translate my-skill --to cursor
skillkit translate --all --to windsurf
```

### Get smart recommendations

SkillKit reads your project, detects your stack, and suggests relevant skills:

```bash
skillkit recommend
# 92% vercel-react-best-practices
# 87% tailwind-v4-patterns
# 85% nextjs-app-router
```

### Discover skills at runtime

Start an API server and let agents find skills on demand:

```bash
skillkit serve
# Server running at http://localhost:3737

curl "http://localhost:3737/search?q=react+performance"
```

Or use MCP for native agent integration:

```json
{
  "mcpServers": {
    "skillkit": { "command": "npx", "args": ["@skillkit/mcp"] }
  }
}
```

Or use Python:

```bash
pip install skillkit-client
```

```python
from skillkit import SkillKitClient

async with SkillKitClient() as client:
    results = await client.search("react performance", limit=5)
```

[REST API docs](https://skillkit.sh/docs/rest-api) &middot; [MCP Server docs](https://skillkit.sh/docs/mcp-server) &middot; [Python Client docs](https://skillkit.sh/docs/python-client) &middot; [Interactive API explorer](https://skillkit.sh/api)

### Auto-generate agent instructions

Let SkillKit analyze your codebase and create CLAUDE.md, .cursorrules, etc.:

```bash
skillkit primer --all-agents
```

### Session memory

Your AI agents learn patterns during sessions, then forget everything. SkillKit captures those learnings:

```bash
skillkit memory compress
skillkit memory search "auth patterns"
skillkit memory export auth-patterns
```

### AI skill generation

Generate skills from natural language with multi-source context:

```bash
skillkit generate
# Interactive wizard with 4 context sources:
# - Documentation (via Context7)
# - Your codebase patterns
# - 400K+ marketplace skills
# - Memory (your corrections)
```

Works with any LLM: Claude, GPT-4, Gemini, Ollama (local), or OpenRouter (100+ models). Generates agent-optimized variants with trust scores.

### Mesh network

Distribute agents across machines with encrypted P2P:

```bash
skillkit mesh init
skillkit mesh discover
```

### Team collaboration

Share skills via a Git-committable `.skills` manifest:

```bash
skillkit manifest init
skillkit manifest add anthropics/skills
git commit -m "add team skills"
```

Team members run `skillkit manifest install` and they're in sync.

### Chrome Extension

Save any webpage as a skill directly from your browser.

1. Build: `pnpm --filter @skillkit/extension build`
2. Chrome → `chrome://extensions` → Load unpacked → `packages/extension/dist/`
3. Click the extension icon or right-click → "Save page as Skill"

The extension sends the page URL to the SkillKit API for server-side extraction with Turndown, 5-source weighted tag detection, and GitHub URL support. The resulting SKILL.md downloads automatically. Then run `skillkit install ~/Downloads/skillkit-skills/my-skill` to deploy to all agents.

[Extension docs](https://skillkit.sh/docs/chrome-extension)

### Interactive TUI

```bash
skillkit ui
```

`h` Home &middot; `m` Marketplace &middot; `r` Recommend &middot; `t` Translate &middot; `i` Installed &middot; `s` Sync &middot; `q` Quit

![SkillKit Interactive CLI](docs/img/inital-command.png)

## Supported Agents (45)

| Agent | Format | Directory |
|-------|--------|-----------|
| **Claude Code** | SKILL.md | `.claude/skills/` |
| **Cursor** | .mdc | `.cursor/skills/` |
| **Codex** | SKILL.md | `.codex/skills/` |
| **Gemini CLI** | SKILL.md | `.gemini/skills/` |
| **OpenCode** | SKILL.md | `.opencode/skills/` |
| **GitHub Copilot** | Markdown | `.github/skills/` |
| **Windsurf** | Markdown | `.windsurf/skills/` |
| **Devin** | Markdown | `.devin/skills/` |
| **Aider** | SKILL.md | `.aider/skills/` |
| **Sourcegraph Cody** | SKILL.md | `.cody/skills/` |
| **Amazon Q** | SKILL.md | `.amazonq/skills/` |

Plus 34 more: Amp, Antigravity, Augment Code, Bolt, Clawdbot, Cline, CodeBuddy, CodeGPT, CommandCode, Continue, Crush, Droid, Factory, Goose, Kilo Code, Kiro CLI, Lovable, MCPJam, Mux, Neovate, OpenClaw, OpenHands, Pi, PlayCode, Qoder, Qwen, Replit Agent, Roo Code, Tabby, Tabnine, Trae, Vercel, Zencoder, Universal

[Full agent details](https://skillkit.sh/docs/agents)

## Commands

### Core

```bash
skillkit install <source>        # Install skills (with live progress)
skillkit remove <skills>         # Remove skills
skillkit remove --source org/repo # Remove all skills from a source
skillkit remove --all            # Remove all installed skills
skillkit update                  # Update skills (with change detection)
skillkit check                   # Check for updates, quality, and activity
skillkit translate <skill> --to  # Translate between agents
skillkit sync                    # Deploy to agent config
skillkit recommend               # Smart recommendations
skillkit generate                # AI skill generation wizard
skillkit serve                   # Start REST API server
skillkit publish submit          # Publish to marketplace via CLI
```

### Discovery & Security

```bash
skillkit marketplace             # Browse skills
skillkit tree                    # Hierarchical taxonomy
skillkit find <query>            # Quick search
skillkit scan <path>             # Security scan for skills
```

### Custom Sources

```bash
skillkit tap add owner/repo      # Add custom skill source
skillkit tap list                # List custom sources
skillkit tap remove owner/repo   # Remove custom source
```

### Issue Planner

```bash
skillkit issue plan "#42"        # Plan from GitHub Issue
skillkit issue plan owner/repo#42 # Cross-repo plan
skillkit issue list              # List open issues
```

### Session Intelligence

```bash
skillkit timeline                # Unified event stream
skillkit session handoff         # Agent-to-agent context
skillkit lineage                 # Skill impact graph
skillkit session explain         # Human-readable summary
skillkit activity                # Skill activity log
```

### Advanced

```bash
skillkit primer --all-agents     # Generate agent instructions
skillkit memory compress         # Capture session learnings
skillkit mesh init               # Multi-machine distribution
skillkit message send            # Inter-agent messaging
skillkit workflow run <name>     # Run workflows
skillkit test                    # Test skills
skillkit cicd init               # CI/CD templates
```

[Full command reference](https://skillkit.sh/docs/commands)

## Creating Skills

```bash
skillkit create my-skill
```

Or manually create a `SKILL.md`:

```markdown
---
name: my-skill
description: What this skill does
license: MIT
---

# My Skill

Instructions for the AI agent.

## When to Use
- Scenario 1
- Scenario 2

## Steps
1. First step
2. Second step
```

## Programmatic API

```typescript
import { translateSkill, analyzeProject, RecommendationEngine } from 'skillkit';

const skill = await translateSkill(content, 'cursor');

const profile = await analyzeProject('./my-project');
const engine = new RecommendationEngine();
const recs = await engine.recommend(profile);
```

```typescript
import { startServer } from '@skillkit/api';
await startServer({ port: 3737, skills: [...] });
```

```typescript
import { MemoryCache, RelevanceRanker } from '@skillkit/core';
const cache = new MemoryCache({ maxSize: 500, ttlMs: 86_400_000 });
const ranker = new RelevanceRanker();
const results = ranker.rank(skills, 'react performance');
```

## Skill Sources

SkillKit aggregates skills from trusted sources. All original creators are credited with their licenses preserved.

### Official Partners

| Repository | Description |
|------------|-------------|
| [anthropics/skills](https://github.com/anthropics/skills) | Official Claude Code skills |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | Next.js and React skills |
| [expo/skills](https://github.com/expo/skills) | Mobile development with Expo |
| [remotion-dev/skills](https://github.com/remotion-dev/skills) | Programmatic video creation |
| [supabase/agent-skills](https://github.com/supabase/agent-skills) | Database and auth skills |
| [stripe/ai](https://github.com/stripe/ai) | Payment integration patterns |

### Community

[trailofbits/skills](https://github.com/trailofbits/skills) &middot; [obra/superpowers](https://github.com/obra/superpowers) &middot; [wshobson/agents](https://github.com/wshobson/agents) &middot; [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) &middot; [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) &middot; [langgenius/dify](https://github.com/langgenius/dify) &middot; [better-auth/skills](https://github.com/better-auth/skills) &middot; [onmax/nuxt-skills](https://github.com/onmax/nuxt-skills) &middot; [elysiajs/skills](https://github.com/elysiajs/skills) &middot; [kadajett/agent-nestjs-skills](https://github.com/kadajett/agent-nestjs-skills) &middot; [cloudai-x/threejs-skills](https://github.com/cloudai-x/threejs-skills) &middot; [dimillian/skills](https://github.com/dimillian/skills) &middot; [waynesutton/convexskills](https://github.com/waynesutton/convexskills) &middot; [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) &middot; [giuseppe-trisciuoglio/developer-kit](https://github.com/giuseppe-trisciuoglio/developer-kit) &middot; [openrouterteam/agent-skills](https://github.com/openrouterteam/agent-skills)

**Want to add your skills?** [Submit your repository](https://github.com/rohitg00/skillkit/issues/new?template=add-source.md)

## Install

```bash
npm install -g skillkit       # npm
pnpm add -g skillkit          # pnpm
yarn global add skillkit      # yarn
bun add -g skillkit           # bun
npx skillkit <command>        # no install
```

### Install sizes

Core commands — `install`, `list`, `find`, `translate`, `recommend`, `publish` —
ship in the default package. Four power features are shipped as **optional
dependencies** so a bare CLI install stays small:

| Feature                  | Package              | Command                     |
| ------------------------ | -------------------- | --------------------------- |
| Interactive terminal UI  | `@skillkit/tui`      | `skillkit ui` / `skillkit tui` |
| REST/OpenAPI server      | `@skillkit/api`      | `skillkit serve`            |
| Peer mesh networking     | `@skillkit/mesh`     | `skillkit mesh …`           |
| Inter-agent messaging    | `@skillkit/messaging`| `skillkit message …`        |

```bash
# Full install — every feature, everything works out of the box (default):
npm install -g skillkit

# Slim install — core commands only, ~75% smaller, no native addons:
npm install -g skillkit --omit=optional
pnpm add -g skillkit --prod --no-optional
```

Cold `npm install` measurements on a fresh cache:

| Install mode          | Packages | Time | Deprecations |
| --------------------- | -------- | ---- | ------------ |
| `skillkit`            | 475      | 18 s | 3            |
| `skillkit --omit=optional` | 118 | 9 s  | 0            |

If you skipped optional deps and later want the UI, server, mesh, or
messaging, add just the one you need:

```bash
npm install -g @skillkit/tui         # skillkit ui
npm install -g @skillkit/api         # skillkit serve
npm install -g @skillkit/mesh        # skillkit mesh
npm install -g @skillkit/messaging   # skillkit message
```

### Using `npx` (no install)

`npx skillkit add <owner/repo>` is the fastest way to try it. First run
downloads the package into the npx cache (`~/.npm/_npx/`); every run
after that is instant.

```bash
# Full (defaults to installing optional features):
npx skillkit add anthropics/skills

# Slim — core commands only, ~75% fewer packages, 0 warnings:
npx --omit=optional skillkit add anthropics/skills
```

Run `npx skillkit` a few times and you will want the global install —
it skips the prompt-to-proceed and kills the per-release cache refetch:

```bash
npm install -g skillkit --omit=optional   # 9 s, 118 packages, one time
skillkit add anthropics/skills            # instant every run
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).

## Links

[Documentation](https://skillkit.sh/docs) &middot; [Website](https://skillkit.sh) &middot; [API Explorer](https://skillkit.sh/api) &middot; [npm](https://www.npmjs.com/package/skillkit) &middot; [GitHub](https://github.com/rohitg00/skillkit)
