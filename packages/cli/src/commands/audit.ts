import { Command, Option } from 'clipanion';
import { resolve } from 'node:path';
import { promises as fs } from 'fs';
import path from 'path';
import { colors, warn, success } from '../onboarding/index.js';
import { AuditLogger, type AuditQuery, type AuditEventType } from '@skillkit/core';

export class AuditCommand extends Command {
  static override paths = [['audit']];

  static override usage = Command.Usage({
    description: 'View and manage audit logs',
    details: `
      The audit command provides access to the audit log system.
      All skill operations, team activities, and plugin actions are logged.

      Subcommands:
        log      View recent audit log entries
        export   Export audit logs to file
        stats    Show audit statistics
        clear    Clear old audit entries
    `,
    examples: [
      ['View recent logs', '$0 audit log'],
      ['View logs with filters', '$0 audit log --type skill.install --limit 20'],
      ['Export logs to JSON', '$0 audit export --format json --output audit.json'],
      ['Show statistics', '$0 audit stats'],
      ['Clear logs older than 30 days', '$0 audit clear --days 30'],
    ],
  });

  subcommand = Option.String({ required: true });

  // Query options
  type = Option.Array('--type,-t', {
    description: 'Filter by event type',
  });

  user = Option.String('--user,-u', {
    description: 'Filter by user',
  });

  resource = Option.String('--resource,-r', {
    description: 'Filter by resource',
  });

  success = Option.Boolean('--success', {
    description: 'Show only successful operations',
  });

  failed = Option.Boolean('--failed', {
    description: 'Show only failed operations',
  });

  since = Option.String('--since', {
    description: 'Show events since date (ISO 8601)',
  });

  until = Option.String('--until', {
    description: 'Show events until date (ISO 8601)',
  });

  limit = Option.String('--limit,-l', {
    description: 'Maximum number of entries',
  });

  // Export options
  format = Option.String('--format,-f', {
    description: 'Export format (json, csv, text)',
  });

  output = Option.String('--output,-o', {
    description: 'Output file path',
  });

  // Clear options
  days = Option.String('--days', {
    description: 'Clear entries older than N days',
  });

  // Common options
  json = Option.Boolean('--json,-j', false, {
    description: 'Output in JSON format',
  });

  projectPath = Option.String('--path,-p', {
    description: 'Project path (default: current directory)',
  });

  async execute(): Promise<number> {
    const targetPath = resolve(this.projectPath || process.cwd());
    const logDir = path.join(targetPath, '.skillkit');
    const logger = new AuditLogger(logDir);

    try {
      switch (this.subcommand) {
        case 'log':
        case 'list':
          return await this.handleLog(logger);
        case 'export':
          return await this.handleExport(logger);
        case 'stats':
          return await this.handleStats(logger);
        case 'clear':
          return await this.handleClear(logger);
        default:
          console.error(colors.error(`Unknown subcommand: ${this.subcommand}\n`));
          console.log('Valid subcommands: log, export, stats, clear');
          return 1;
      }
    } finally {
      await logger.destroy();
    }
  }

  private async handleLog(logger: AuditLogger): Promise<number> {
    const query = this.buildQuery();
    const events = await logger.query(query);

    if (this.json) {
      console.log(JSON.stringify(events, null, 2));
      return 0;
    }

    if (events.length === 0) {
      warn('No audit events found');
      return 0;
    }

    console.log(colors.cyan(`\nAudit Log (${events.length} entries):\n`));

    for (const event of events) {
      const statusIcon = event.success ? colors.success('✓') : colors.error('✗');
      const timestamp = event.timestamp.toLocaleString();

      console.log(
        `${statusIcon} ${colors.muted(timestamp)} ${colors.bold(event.type)}`
      );
      console.log(
        `   ${event.action} on ${colors.cyan(event.resource)}`
      );

      if (event.user) {
        console.log(`   ${colors.muted('User:')} ${event.user}`);
      }

      if (event.duration) {
        console.log(`   ${colors.muted('Duration:')} ${event.duration}ms`);
      }

      if (event.error) {
        console.log(`   ${colors.error('Error:')} ${event.error}`);
      }

      if (event.details && Object.keys(event.details).length > 0) {
        console.log(`   ${colors.muted('Details:')} ${JSON.stringify(event.details)}`);
      }

      console.log();
    }

    return 0;
  }

  private async handleExport(logger: AuditLogger): Promise<number> {
    const format = (this.format as 'json' | 'csv' | 'text') || 'json';
    const query = this.buildQuery();

    const content = await logger.export({ format, query });

    if (this.output) {
      const outputPath = resolve(this.output);
      await fs.writeFile(outputPath, content, 'utf-8');
      success(`✓ Exported audit log to: ${outputPath}`);
    } else {
      console.log(content);
    }

    return 0;
  }

  private async handleStats(logger: AuditLogger): Promise<number> {
    const stats = await logger.stats();

    if (this.json) {
      console.log(JSON.stringify(stats, null, 2));
      return 0;
    }

    console.log(colors.cyan('\nAudit Statistics:\n'));
    console.log(`Total Events: ${colors.bold(stats.totalEvents.toString())}`);
    console.log(
      `Success Rate: ${colors.bold(`${(stats.successRate * 100).toFixed(1)}%`)}`
    );

    if (Object.keys(stats.eventsByType).length > 0) {
      console.log(colors.cyan('\nEvents by Type:'));
      const sorted = Object.entries(stats.eventsByType).sort(
        ([, a], [, b]) => b - a
      );
      for (const [type, count] of sorted) {
        console.log(`  ${type.padEnd(30)} ${count}`);
      }
    }

    if (stats.topResources.length > 0) {
      console.log(colors.cyan('\nTop Resources:'));
      for (const { resource, count } of stats.topResources) {
        console.log(`  ${resource.padEnd(40)} ${count}`);
      }
    }

    if (stats.recentErrors.length > 0) {
      console.log(colors.cyan(`\nRecent Errors (${stats.recentErrors.length}):`));
      for (const err of stats.recentErrors.slice(0, 5)) {
        const timestamp = err.timestamp.toLocaleString();
        console.log(
          `  ${colors.error('✗')} ${colors.muted(timestamp)} ${err.type}`
        );
        if (err.error) {
          console.log(`     ${colors.muted(err.error)}`);
        }
      }
    }

    console.log();
    return 0;
  }

  private async handleClear(logger: AuditLogger): Promise<number> {
    if (!this.days) {
      console.error(colors.error('--days option required'));
      return 1;
    }

    const daysAgo = parseInt(this.days, 10);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

    const cleared = await logger.clear(cutoffDate);

    success(`✓ Cleared ${cleared} audit entries older than ${daysAgo} days`);

    return 0;
  }

  private buildQuery(): AuditQuery {
    const query: AuditQuery = {};

    if (this.type && this.type.length > 0) {
      query.types = this.type as AuditEventType[];
    }

    if (this.user) {
      query.user = this.user;
    }

    if (this.resource) {
      query.resource = this.resource;
    }

    if (this.success) {
      query.success = true;
    } else if (this.failed) {
      query.success = false;
    }

    if (this.since) {
      query.startDate = new Date(this.since);
    }

    if (this.until) {
      query.endDate = new Date(this.until);
    }

    if (this.limit) {
      query.limit = parseInt(this.limit, 10);
    } else {
      query.limit = 50;
    }

    return query;
  }
}
