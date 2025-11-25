/**
 * TalonBOT Analytics Plugin
 * 
 * Discord-style analytics: stats, topusers, activity
 */

import { BasePlugin, BaseCommand } from '../base';
import { CommandContext, CommandResult } from '../../types';
import prisma from '../../lib/prisma';
import dayjs from 'dayjs';

// Stats Command
class StatsCommand extends BaseCommand {
  constructor() {
    super('stats', 'Show bot usage statistics', '!stats [days]', {
      aliases: ['statistics', 'usage'],
      adminOnly: true,
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args, groupId } = context;
    const days = parseInt(args) || 7;
    const since = dayjs().subtract(days, 'day').toDate();

    try {
      // Command usage stats
      const totalCommands = await prisma.commandUsage.count({
        where: { timestamp: { gte: since } },
      });

      const successfulCommands = await prisma.commandUsage.count({
        where: { timestamp: { gte: since }, success: true },
      });

      const uniqueUsers = await prisma.commandUsage.findMany({
        where: { timestamp: { gte: since } },
        select: { userId: true },
        distinct: ['userId'],
      });

      const uniqueGroups = await prisma.commandUsage.findMany({
        where: { timestamp: { gte: since }, groupId: { not: null } },
        select: { groupId: true },
        distinct: ['groupId'],
      });

      // Message stats
      const totalMessages = await prisma.message.count({
        where: { createdAt: { gte: since } },
      });

      const messageUsers = await prisma.message.findMany({
        where: { createdAt: { gte: since } },
        select: { senderId: true },
        distinct: ['senderId'],
      });

      // Calculate stats
      const avgPerDay = Math.round(totalCommands / days);
      const successRate = totalCommands > 0
        ? ((successfulCommands / totalCommands) * 100).toFixed(1)
        : '0';

      return {
        success: true,
        message: `
📊 **Bot Statistics** (Last ${days} days)

📈 **Command Usage**
• Total Commands: ${totalCommands}
• Success Rate: ${successRate}%
• Avg/Day: ${avgPerDay}
• Active Users: ${uniqueUsers.length}
• Active Groups: ${uniqueGroups.length}

💬 **Messages**
• Total Messages: ${totalMessages}
• Unique Senders: ${messageUsers.length}
• Avg/Day: ${Math.round(totalMessages / days)}

💡 Use \`!topusers\` to see most active members
`.trim(),
      };
    } catch (error) {
      return { success: false, message: 'Failed to retrieve statistics.' };
    }
  }
}

// Top Users Command
class TopUsersCommand extends BaseCommand {
  constructor() {
    super('topusers', 'Show most active users', '!topusers [limit]', {
      aliases: ['top', 'leaderboard'],
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args, groupId } = context;
    const limit = Math.min(parseInt(args) || 10, 15);

    try {
      const whereClause: Record<string, unknown> = {};
      if (groupId) whereClause['groupId'] = groupId;

      const topUsers = await prisma.message.groupBy({
        by: ['senderId', 'senderName'],
        where: whereClause,
        _count: { senderId: true },
        orderBy: { _count: { senderId: 'desc' } },
        take: limit,
      });

      if (topUsers.length === 0) {
        return { success: true, message: '👥 No message data available yet.' };
      }

      let response = `🏆 **Top ${limit} Active Users**\n\n`;

      topUsers.forEach((user, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const name = user.senderName || user.senderId;
        response += `${medal} ${name}: ${user._count.senderId} msgs\n`;
      });

      return { success: true, message: response.trim() };
    } catch (error) {
      return { success: false, message: 'Failed to retrieve top users.' };
    }
  }
}

// Top Commands Command
class TopCommandsCommand extends BaseCommand {
  constructor() {
    super('topcmds', 'Show most used commands', '!topcmds [limit]', {
      aliases: ['topcommands', 'popularcommands'],
      adminOnly: true,
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args } = context;
    const limit = Math.min(parseInt(args) || 10, 15);

    try {
      const topCommands = await prisma.commandUsage.groupBy({
        by: ['command'],
        _count: { command: true },
        orderBy: { _count: { command: 'desc' } },
        take: limit,
      });

      if (topCommands.length === 0) {
        return { success: true, message: '📊 No command usage data available yet.' };
      }

      let response = `📊 **Top ${limit} Commands**\n\n`;

      topCommands.forEach((cmd, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        response += `${medal} !${cmd.command}: ${cmd._count.command} uses\n`;
      });

      return { success: true, message: response.trim() };
    } catch (error) {
      return { success: false, message: 'Failed to retrieve top commands.' };
    }
  }
}

// Activity Command
class ActivityCommand extends BaseCommand {
  constructor() {
    super('activity', 'Show activity overview', '!activity [days]', {
      aliases: ['chart', 'graph'],
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args, groupId } = context;
    const days = Math.min(parseInt(args) || 7, 14);
    const since = dayjs().subtract(days, 'day').toDate();

    try {
      const whereClause: Record<string, unknown> = { createdAt: { gte: since } };
      if (groupId) whereClause['groupId'] = groupId;

      const messages = await prisma.message.findMany({
        where: whereClause,
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      if (messages.length === 0) {
        return { success: true, message: `📊 No activity in the last ${days} days.` };
      }

      // Group by day
      const dailyCounts: Record<string, number> = {};
      for (let i = 0; i < days; i++) {
        const day = dayjs().subtract(i, 'day').format('MM/DD');
        dailyCounts[day] = 0;
      }

      for (const msg of messages) {
        const day = dayjs(msg.createdAt).format('MM/DD');
        if (day in dailyCounts) {
          dailyCounts[day]++;
        }
      }

      // Find max for scaling
      const maxCount = Math.max(...Object.values(dailyCounts), 1);

      let response = `📊 **Activity** (Last ${days} days)\n\n`;
      
      // Build ASCII chart
      const sortedDays = Object.entries(dailyCounts).reverse();
      for (const [day, count] of sortedDays) {
        const barLength = Math.round((count / maxCount) * 10);
        const bar = '▓'.repeat(barLength) + '░'.repeat(10 - barLength);
        response += `${day} ${bar} ${count}\n`;
      }

      response += `\n📈 Total: ${messages.length} msgs`;
      response += `\n📉 Avg: ${Math.round(messages.length / days)}/day`;

      return { success: true, message: response };
    } catch (error) {
      return { success: false, message: 'Failed to retrieve activity data.' };
    }
  }
}

// Hourly Activity Command
class HourlyCommand extends BaseCommand {
  constructor() {
    super('hourly', 'Show hourly activity pattern', '!hourly [days]', {
      aliases: ['hours', 'timeofday'],
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args, groupId } = context;
    const days = Math.min(parseInt(args) || 7, 30);
    const since = dayjs().subtract(days, 'day').toDate();

    try {
      const whereClause: Record<string, unknown> = { createdAt: { gte: since } };
      if (groupId) whereClause['groupId'] = groupId;

      const messages = await prisma.message.findMany({
        where: whereClause,
        select: { createdAt: true },
      });

      if (messages.length === 0) {
        return { success: true, message: '📊 No activity data available.' };
      }

      // Group by hour
      const hourCounts: Record<number, number> = {};
      for (let i = 0; i < 24; i++) {
        hourCounts[i] = 0;
      }

      for (const msg of messages) {
        const hour = dayjs(msg.createdAt).hour();
        hourCounts[hour]++;
      }

      // Find peak hours
      const sortedHours = Object.entries(hourCounts)
        .map(([h, c]) => ({ hour: parseInt(h), count: c }))
        .sort((a, b) => b.count - a.count);

      const peakHours = sortedHours.slice(0, 3);
      const quietHours = sortedHours.filter(h => h.count === 0).length;

      let response = `⏰ **Hourly Activity** (Last ${days} days)\n\n`;

      response += `🔥 **Peak Hours:**\n`;
      for (const { hour, count } of peakHours) {
        const timeStr = dayjs().hour(hour).format('h A');
        response += `• ${timeStr}: ${count} messages\n`;
      }

      response += `\n💤 Quiet Hours: ${quietHours} hours with no activity`;

      return { success: true, message: response };
    } catch (error) {
      return { success: false, message: 'Failed to retrieve hourly data.' };
    }
  }
}

// Analytics Plugin
export class AnalyticsPlugin extends BasePlugin {
  constructor() {
    super('analytics', 'Analytics and statistics', '1.0.0');

    // Register commands
    this.registerCommand(new StatsCommand());
    this.registerCommand(new TopUsersCommand());
    this.registerCommand(new TopCommandsCommand());
    this.registerCommand(new ActivityCommand());
    this.registerCommand(new HourlyCommand());
  }

  async initialize(): Promise<void> {
    await super.initialize();
    this.log('info', 'Analytics plugin initialized');
  }
}

export default AnalyticsPlugin;
