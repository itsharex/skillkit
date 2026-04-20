#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Cli, Builtins } from 'clipanion';
import { setVersion, setAgentCount } from '@skillkit/cli';
import { getAdapterCount } from '@skillkit/agents';
import {
  InstallCommand,
  SyncCommand,
  ReadCommand,
  InitCommand,
  TranslateCommand,
  RecommendCommand,
  GenerateCommand,
  PrimerCommand,
  MemoryCommand,
  ServeCommand,
  MeshCommand,
} from '@skillkit/cli';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version || '1.22.1';

setVersion(version);
setAgentCount(getAdapterCount());

const cli = new Cli({
  binaryLabel: 'skillkit-test',
  binaryName: 'skillkit-test',
  binaryVersion: version,
});

cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);

// Only register the commands we need for Hermes verification
cli.register(InstallCommand);
cli.register(SyncCommand);
cli.register(ReadCommand);
cli.register(InitCommand);
cli.register(TranslateCommand);
cli.register(RecommendCommand);
cli.register(GenerateCommand);
cli.register(PrimerCommand);
cli.register(MemoryCommand);
cli.register(ServeCommand);
cli.register(MeshCommand);

cli.runExit(process.argv.slice(2));
