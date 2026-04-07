import { Command, Option } from 'clipanion';
import { colors, error } from '../onboarding/index.js';

export class MessageCommand extends Command {
  static override paths = [['message'], ['msg']];

  static override usage = Command.Usage({
    description: 'Inter-agent messaging system',
    details: `
      The message command enables communication between AI agents
      across the mesh network.

      Subcommands:
      - send:     Send a message to an agent
      - inbox:    View inbox messages
      - read:     Read a specific message
      - reply:    Reply to a message
      - archive:  Archive a message
      - forward:  Forward a message
      - sent:     View sent messages
      - status:   Show messaging status
    `,
    examples: [
      ['Send a message', '$0 message send backend-agent --body "API ready"'],
      ['Send with priority', '$0 message send agent --body "Urgent!" --priority high'],
      ['View inbox', '$0 message inbox'],
      ['View unread', '$0 message inbox --unread'],
      ['Read a message', '$0 message read <id>'],
      ['Reply to message', '$0 message reply <id> --body "Thanks!"'],
      ['Archive a message', '$0 message archive <id>'],
      ['Forward a message', '$0 message forward <id> other-agent'],
    ],
  });

  action = Option.String({ required: false });
  arg = Option.String({ required: false });
  arg2 = Option.String({ required: false });
  body = Option.String('--body,-b', { description: 'Message body' });
  subject = Option.String('--subject,-s', { description: 'Message subject' });
  priority = Option.String('--priority,-p', { description: 'Priority: low, normal, high, urgent' });
  type = Option.String('--type,-t', { description: 'Type: request, response, notification, update' });
  unread = Option.Boolean('--unread,-u', false, { description: 'Show only unread messages' });
  limit = Option.String('--limit,-l', { description: 'Maximum number of results' });
  agent = Option.String('--agent,-a', { description: 'Agent ID (defaults to current agent)' });
  json = Option.Boolean('--json,-j', false, { description: 'Output in JSON format' });
  verbose = Option.Boolean('--verbose,-v', false, { description: 'Show detailed output' });

  async execute(): Promise<number> {
    const action = this.action || 'inbox';

    switch (action) {
      case 'send':
        return this.sendMessage();
      case 'inbox':
        return this.showInbox();
      case 'read':
        return this.readMessage();
      case 'reply':
        return this.replyMessage();
      case 'archive':
        return this.archiveMessage();
      case 'forward':
        return this.forwardMessage();
      case 'sent':
        return this.showSent();
      case 'status':
        return this.showStatus();
      default:
        error(`Unknown action: ${action}`);
        console.log(colors.muted('Available actions: send, inbox, read, reply, archive, forward, sent, status'));
        return 1;
    }
  }

  private getAgentId(): string {
    return this.agent || process.env.SKILLKIT_AGENT_ID || 'default-agent';
  }

  private async sendMessage(): Promise<number> {
    const to = this.arg;
    if (!to) {
      error('Error: Recipient is required');
      console.log(colors.muted('Usage: skillkit message send <to> --body "..."'));
      return 1;
    }

    if (!this.body) {
      error('Error: Message body is required');
      console.log(colors.muted('Usage: skillkit message send <to> --body "..."'));
      return 1;
    }

    try {
      const { createMessagingService } = await import('@skillkit/messaging');

      const agentId = this.getAgentId();
      const service = await createMessagingService(agentId);

      const result = await service.send({
        to,
        subject: this.subject || 'Message from SkillKit',
        body: this.body,
        priority: (this.priority as any) || 'normal',
        type: (this.type as any) || 'notification',
      });

      if (result.delivered) {
        console.log(colors.success(`✓ Message sent to ${to}`));
        console.log(`  ID: ${colors.muted(result.messageId.slice(0, 8))}`);
        console.log(`  Via: ${result.via}`);
      } else {
        error(`✗ Failed to deliver message`);
        if (result.error) {
          console.error(colors.muted(`  Error: ${result.error}`));
        }
        return 1;
      }

      return 0;
    } catch (err: any) {
      error(`Failed to send message: ${err.message}`);
      return 1;
    }
  }

  private async showInbox(): Promise<number> {
    try {
      const { createMessagingService } = await import('@skillkit/messaging');

      const agentId = this.getAgentId();
      const service = await createMessagingService(agentId);

      const filter: any = {};
      if (this.unread) {
        filter.status = 'unread';
      }
      if (this.limit) {
        filter.limit = parseInt(this.limit, 10);
      }

      const messages = await service.getInbox(filter);

      if (this.json) {
        console.log(JSON.stringify(messages, null, 2));
        return 0;
      }

      const summary = await service.getInboxSummary();

      console.log(colors.bold(`\nInbox (${summary.unread} unread / ${summary.total} total)\n`));

      if (messages.length === 0) {
        console.log(colors.muted('  No messages.'));
        return 0;
      }

      for (const message of messages) {
        const isUnread = message.status === 'unread';
        const priorityIcon = this.getPriorityIcon(message.priority);
        const statusIcon = isUnread ? colors.cyan('●') : colors.muted('○');

        console.log(`${statusIcon} ${priorityIcon} ${isUnread ? colors.bold(message.subject) : message.subject}`);
        console.log(`  ID: ${colors.muted(message.id.slice(0, 8))} | From: ${message.from} | ${this.formatDate(message.createdAt)}`);

        if (this.verbose) {
          const bodyPreview = typeof message.body === 'string'
            ? message.body.slice(0, 80)
            : JSON.stringify(message.body).slice(0, 80);
          console.log(`  ${colors.muted(bodyPreview)}${bodyPreview.length >= 80 ? '...' : ''}`);
        }
      }

      console.log();
      return 0;
    } catch (err: any) {
      error(`Failed to show inbox: ${err.message}`);
      return 1;
    }
  }

  private async readMessage(): Promise<number> {
    const id = this.arg;
    if (!id) {
      error('Error: Message ID is required');
      console.log(colors.muted('Usage: skillkit message read <id>'));
      return 1;
    }

    try {
      const { createMessagingService } = await import('@skillkit/messaging');

      const agentId = this.getAgentId();
      const service = await createMessagingService(agentId);

      const message = await service.markAsRead(id);

      if (!message) {
        const messages = await service.getInbox();
        const found = messages.find(m => m.id.startsWith(id));

        if (found) {
          const marked = await service.markAsRead(found.id);
          if (marked) {
            return this.displayMessage(marked);
          }
        }

        error(`Message not found: ${id}`);
        return 1;
      }

      return this.displayMessage(message);
    } catch (err: any) {
      error(`Failed to read message: ${err.message}`);
      return 1;
    }
  }

  private displayMessage(message: any): number {
    if (this.json) {
      console.log(JSON.stringify(message, null, 2));
      return 0;
    }

    console.log(colors.bold(`\n${message.subject}\n`));
    console.log(`From: ${message.from}`);
    console.log(`To: ${message.to}`);
    console.log(`Date: ${new Date(message.createdAt).toLocaleString()}`);
    console.log(`Priority: ${message.priority}`);
    console.log(`Type: ${message.type}`);
    console.log(`ID: ${colors.muted(message.id)}`);

    if (message.replyTo) {
      console.log(`Reply to: ${colors.muted(message.replyTo)}`);
    }
    if (message.threadId) {
      console.log(`Thread: ${colors.muted(message.threadId)}`);
    }

    console.log(colors.bold('\nBody:\n'));
    if (typeof message.body === 'string') {
      console.log(message.body);
    } else {
      console.log(JSON.stringify(message.body, null, 2));
    }

    console.log();
    return 0;
  }

  private async replyMessage(): Promise<number> {
    const id = this.arg;
    if (!id) {
      error('Error: Message ID is required');
      console.log(colors.muted('Usage: skillkit message reply <id> --body "..."'));
      return 1;
    }

    if (!this.body) {
      error('Error: Reply body is required');
      console.log(colors.muted('Usage: skillkit message reply <id> --body "..."'));
      return 1;
    }

    try {
      const { createMessagingService } = await import('@skillkit/messaging');

      const agentId = this.getAgentId();
      const service = await createMessagingService(agentId);

      let messageId = id;
      const message = await service.getMessage(id);
      if (!message) {
        const messages = await service.getInbox();
        const found = messages.find(m => m.id.startsWith(id));
        if (found) {
          messageId = found.id;
        } else {
          error(`Message not found: ${id}`);
          return 1;
        }
      }

      const result = await service.reply(messageId, this.body);

      if (result.delivered) {
        console.log(colors.success('✓ Reply sent'));
        console.log(`  ID: ${colors.muted(result.messageId.slice(0, 8))}`);
      } else {
        error('✗ Failed to send reply');
        if (result.error) {
          console.error(colors.muted(`  Error: ${result.error}`));
        }
        return 1;
      }

      return 0;
    } catch (err: any) {
      error(`Failed to reply: ${err.message}`);
      return 1;
    }
  }

  private async archiveMessage(): Promise<number> {
    const id = this.arg;
    if (!id) {
      error('Error: Message ID is required');
      console.log(colors.muted('Usage: skillkit message archive <id>'));
      return 1;
    }

    try {
      const { createMessagingService } = await import('@skillkit/messaging');

      const agentId = this.getAgentId();
      const service = await createMessagingService(agentId);

      let messageId = id;
      const message = await service.getMessage(id);
      if (!message) {
        const messages = await service.getInbox();
        const found = messages.find(m => m.id.startsWith(id));
        if (found) {
          messageId = found.id;
        } else {
          error(`Message not found: ${id}`);
          return 1;
        }
      }

      const archived = await service.archive(messageId);

      if (archived) {
        console.log(colors.success('✓ Message archived'));
      } else {
        error('✗ Failed to archive message');
        return 1;
      }

      return 0;
    } catch (err: any) {
      error(`Failed to archive: ${err.message}`);
      return 1;
    }
  }

  private async forwardMessage(): Promise<number> {
    const id = this.arg;
    const to = this.arg2;

    if (!id) {
      error('Error: Message ID is required');
      console.log(colors.muted('Usage: skillkit message forward <id> <to>'));
      return 1;
    }

    if (!to) {
      error('Error: Recipient is required');
      console.log(colors.muted('Usage: skillkit message forward <id> <to>'));
      return 1;
    }

    try {
      const { createMessagingService } = await import('@skillkit/messaging');

      const agentId = this.getAgentId();
      const service = await createMessagingService(agentId);

      let messageId = id;
      const message = await service.getMessage(id);
      if (!message) {
        const messages = await service.getInbox();
        const found = messages.find(m => m.id.startsWith(id));
        if (found) {
          messageId = found.id;
        } else {
          error(`Message not found: ${id}`);
          return 1;
        }
      }

      const result = await service.forward(messageId, to, this.body);

      if (result.delivered) {
        console.log(colors.success(`✓ Message forwarded to ${to}`));
        console.log(`  ID: ${colors.muted(result.messageId.slice(0, 8))}`);
      } else {
        error('✗ Failed to forward message');
        if (result.error) {
          console.error(colors.muted(`  Error: ${result.error}`));
        }
        return 1;
      }

      return 0;
    } catch (err: any) {
      error(`Failed to forward: ${err.message}`);
      return 1;
    }
  }

  private async showSent(): Promise<number> {
    try {
      const { createMessagingService } = await import('@skillkit/messaging');

      const agentId = this.getAgentId();
      const service = await createMessagingService(agentId);

      const filter: any = {};
      if (this.limit) {
        filter.limit = parseInt(this.limit, 10);
      }

      const messages = await service.getSent(filter);

      if (this.json) {
        console.log(JSON.stringify(messages, null, 2));
        return 0;
      }

      console.log(colors.bold(`\nSent Messages (${messages.length})\n`));

      if (messages.length === 0) {
        console.log(colors.muted('  No sent messages.'));
        return 0;
      }

      for (const message of messages) {
        const priorityIcon = this.getPriorityIcon(message.priority);

        console.log(`${colors.muted('○')} ${priorityIcon} ${message.subject}`);
        console.log(`  ID: ${colors.muted(message.id.slice(0, 8))} | To: ${message.to} | ${this.formatDate(message.createdAt)}`);
      }

      console.log();
      return 0;
    } catch (err: any) {
      error(`Failed to show sent: ${err.message}`);
      return 1;
    }
  }

  private async showStatus(): Promise<number> {
    try {
      const { createMessagingService } = await import('@skillkit/messaging');

      const agentId = this.getAgentId();
      const service = await createMessagingService(agentId);

      const summary = await service.getInboxSummary();
      const sent = await service.getSent({ limit: 1000 });
      const archived = await service.getArchived({ limit: 1000 });

      if (this.json) {
        console.log(JSON.stringify({
          agentId,
          inbox: summary,
          sentCount: sent.length,
          archivedCount: archived.length,
        }, null, 2));
        return 0;
      }

      console.log(colors.bold('\nMessaging Status\n'));

      console.log(colors.cyan('Agent:'));
      console.log(`  ID: ${agentId}`);

      console.log();
      console.log(colors.cyan('Inbox:'));
      console.log(`  Total: ${summary.total}`);
      console.log(`  Unread: ${summary.unread}`);
      console.log(`  By priority: urgent=${summary.byPriority.urgent}, high=${summary.byPriority.high}, normal=${summary.byPriority.normal}, low=${summary.byPriority.low}`);

      console.log();
      console.log(colors.cyan('Storage:'));
      console.log(`  Sent: ${sent.length}`);
      console.log(`  Archived: ${archived.length}`);

      console.log();
      return 0;
    } catch (err: any) {
      error(`Failed to get status: ${err.message}`);
      return 1;
    }
  }

  private getPriorityIcon(priority: string): string {
    switch (priority) {
      case 'urgent':
        return colors.error('!!!!');
      case 'high':
        return colors.warning('!!!');
      case 'normal':
        return colors.muted('!');
      case 'low':
        return colors.muted('·');
      default:
        return '';
    }
  }

  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  }
}
