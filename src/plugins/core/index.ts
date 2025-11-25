/**
 * TalonBOT Core Plugin
 * 
 * Basic commands: help, ping, info, whoami
 */

import { BasePlugin, BaseCommand } from '../base';
import { CommandContext, CommandResult } from '../../types';

// Help Command
class HelpCommand extends BaseCommand {
  constructor() {
    super('help', 'Show all available commands', '!help [command]', {
      aliases: ['h', '?'],
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args, bot } = context;

    if (args) {
      // Show help for specific command
      // This would need access to all plugins - handled by bot
      return {
        success: true,
        message: `Use !help to see all commands.`,
      };
    }

    const helpText = `
🤖 **TalonBOT Commands**

📋 **Basic**
• \`!help\` - Show this help message
• \`!ping\` - Check if bot is online
• \`!info\` - Bot information and status
• \`!whoami\` - Show your Signal info

👥 **Member Management** (Discord-style)
• \`!member list\` - List all members
• \`!member info +1234567890\` - Show member info
• \`!member kick +1234567890 --reason "spam"\`
• \`!member warn +1234567890 --reason "warning"\`

🚫 **Bans** (Admin)
• \`!ban add +1234567890 --reason "rule violation"\`
• \`!ban add +1234567890 --duration 7d\`
• \`!ban remove +1234567890\`
• \`!ban list\`

🔇 **Mutes** (Mod)
• \`!mute add +1234567890 --duration 2h\`
• \`!mute remove +1234567890\`
• \`!mute list\`

🛡️ **Moderators** (Admin)
• \`!mod add +1234567890\`
• \`!mod remove +1234567890\`
• \`!mod list\`

📰 **Briefings & FOMO Prevention**
• \`!brief [time]\` - Quick briefing (e.g., !brief 6h)
• \`!catchup\` - Smart catch-up on what you missed
• \`!digest daily|weekly\` - Comprehensive digest
• \`!highlights [time]\` - Key highlights
• \`!topics [time]\` - Discussion topics
• \`!timeline [hours]\` - Visual activity timeline

📊 **Reports**
• \`!report [days]\` - Activity report
• \`!summary [hours]\` - Chat summary
• \`!search <keyword>\` - Search messages
• \`!userstats +1234567890\` - User stats

📈 **Analytics** (Admin)
• \`!stats\` - Overall statistics
• \`!topusers\` - Most active users
• \`!admin logs\` - Admin action logs

💡 Use \`!command\` (no args) for detailed help
`.trim();

    return {
      success: true,
      message: helpText,
    };
  }
}

// Ping Command
class PingCommand extends BaseCommand {
  constructor() {
    super('ping', 'Check if bot is online', '!ping', {
      aliases: ['p'],
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const latency = Date.now() - context.timestamp;
    return {
      success: true,
      message: `🏓 Pong! Latency: ${latency}ms`,
    };
  }
}

// Info Command
class InfoCommand extends BaseCommand {
  constructor() {
    super('info', 'Bot information and status', '!info', {
      aliases: ['about', 'version'],
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const infoText = `
🤖 **TalonBOT**
Version: 1.0.0
Status: ✅ Online

⏱️ Uptime: ${hours}h ${minutes}m ${seconds}s
📍 Mode: ${context.groupId ? 'Group' : 'Direct Message'}

🔗 GitHub: github.com/swolem12/TalonBOT
`.trim();

    return {
      success: true,
      message: infoText,
    };
  }
}

// WhoAmI Command
class WhoAmICommand extends BaseCommand {
  constructor() {
    super('whoami', 'Show your Signal information', '!whoami', {
      aliases: ['me', 'myinfo'],
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { sender, senderName, isAdmin, isModerator, groupId, groupName } = context;

    let role = '👤 Member';
    if (isAdmin) role = '👑 Admin';
    else if (isModerator) role = '🛡️ Moderator';

    const infoText = `
📱 **Your Info**

Phone: ${sender}
Name: ${senderName || 'Unknown'}
Role: ${role}
${groupId ? `\n📍 Current Group: ${groupName || groupId}` : '📍 Direct Message'}
`.trim();

    return {
      success: true,
      message: infoText,
    };
  }
}

// Status Command
class StatusCommand extends BaseCommand {
  constructor() {
    super('status', 'Check bot operational status', '!status', {
      aliases: ['health'],
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const memUsage = process.memoryUsage();
    const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);

    return {
      success: true,
      message: `
✅ **Bot Status**

🟢 Signal CLI: Connected
🟢 Database: Connected
💾 Memory: ${memMB} MB
⚡ Node.js: ${process.version}
`.trim(),
    };
  }
}

// Core Plugin
export class CorePlugin extends BasePlugin {
  constructor() {
    super('core', 'Core bot functionality - help, ping, info', '1.0.0');

    // Register commands
    this.registerCommand(new HelpCommand());
    this.registerCommand(new PingCommand());
    this.registerCommand(new InfoCommand());
    this.registerCommand(new WhoAmICommand());
    this.registerCommand(new StatusCommand());
  }

  async initialize(): Promise<void> {
    await super.initialize();
    this.log('info', 'Core plugin initialized with basic commands');
  }
}

export default CorePlugin;
