# SkillKit GitHub Action

A reusable composite action to install, scan, and manage AI agent skills in CI/CD pipelines.

## Usage

```yaml
# Install skills
- uses: rohitg00/skillkit/.github/actions/skillkit@main
  with:
    command: install
    source: anthropics/skills

# Security scan
- uses: rohitg00/skillkit/.github/actions/skillkit@main
  with:
    command: scan
    source: ./skills

# Check for updates
- uses: rohitg00/skillkit/.github/actions/skillkit@main
  with:
    command: check
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `command` | SkillKit command to run (`install`, `scan`, `check`, `sync`) | Yes | |
| `source` | Skill source for install (e.g. `owner/repo`) | No | |
| `args` | Additional arguments | No | `''` |
| `node-version` | Node.js version | No | `20` |
| `agent` | Target agent (e.g. `claude-code`, `cursor`) | No | `claude-code` |

## Examples

### Install and sync skills

```yaml
jobs:
  setup-skills:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: rohitg00/skillkit/.github/actions/skillkit@main
        with:
          command: install
          source: anthropics/skills
          agent: cursor

      - uses: rohitg00/skillkit/.github/actions/skillkit@main
        with:
          command: sync
```

### Security scan on PR

```yaml
jobs:
  scan-skills:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: rohitg00/skillkit/.github/actions/skillkit@main
        with:
          command: scan
          source: ./skills
          args: '--fail-on high'
```

### Check for updates

```yaml
jobs:
  check-updates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: rohitg00/skillkit/.github/actions/skillkit@main
        with:
          command: check
          args: '--json'
```
