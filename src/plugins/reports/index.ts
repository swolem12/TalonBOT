/**
 * TalonBOT Reports Plugin
 * 
 * Chat reporting: report, summary, search, userstats
 */

import { BasePlugin, BaseCommand } from '../base';
import { CommandContext, CommandResult } from '../../types';
import prisma from '../../lib/prisma';
import dayjs from 'dayjs';

// Report Command
class ReportCommand extends BaseCommand {
  constructor() {
    super('report', 'Generate activity report', '!report [days]', {
      aliases: ['activity'],
      groupOnly: true,
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args, groupId, groupName } = context;

    const days = parseInt(args) || 7;
    const startDate = dayjs().subtract(days, 'day').toDate();

    try {
      // Get message count
      const messageCount = await prisma.message.count({
        where: {
          groupId,
          createdAt: { gte: startDate },
        },
      });

      // Get unique users
      const uniqueUsers = await prisma.message.findMany({
        where: {
          groupId,
          createdAt: { gte: startDate },
        },
        select: { senderId: true },
        distinct: ['senderId'],
      });

      // Get top users
      const topUsers = await prisma.message.groupBy({
        by: ['senderId', 'senderName'],
        where: {
          groupId,
          createdAt: { gte: startDate },
        },
        _count: { senderId: true },
        orderBy: { _count: { senderId: 'desc' } },
        take: 5,
      });

      // Get daily breakdown
      const messages = await prisma.message.findMany({
        where: {
          groupId,
          createdAt: { gte: startDate },
        },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      // Calculate messages per day
      const dailyCounts: Record<string, number> = {};
      for (const msg of messages) {
        const day = dayjs(msg.createdAt).format('ddd');
        dailyCounts[day] = (dailyCounts[day] || 0) + 1;
      }

      // Build report
      let report = `📊 **Activity Report** (Last ${days} days)\n`;
      report += `📍 Group: ${groupName || groupId}\n\n`;

      report += `📈 **Overview**\n`;
      report += `• Total Messages: ${messageCount}\n`;
      report += `• Active Users: ${uniqueUsers.length}\n`;
      report += `• Avg/Day: ${Math.round(messageCount / days)}\n\n`;

      if (topUsers.length > 0) {
        report += `🏆 **Top Contributors**\n`;
        topUsers.forEach((user, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
          const name = user.senderName || user.senderId;
          report += `${medal} ${name}: ${user._count.senderId} msgs\n`;
        });
        report += '\n';
      }

      report += `📅 **Daily Activity**\n`;
      const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      for (const day of daysOfWeek) {
        const count = dailyCounts[day] || 0;
        const bar = '▓'.repeat(Math.min(count / 5, 10)) || '░';
        report += `${day}: ${bar} ${count}\n`;
      }

      // Save report to database
      await prisma.report.create({
        data: {
          reportType: 'activity',
          groupId,
          groupName,
          creatorId: context.sender,
          startDate,
          endDate: new Date(),
          messageCount,
          content: report,
        },
      });

      return {
        success: true,
        message: report.trim(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to generate report. Make sure there are messages to analyze.',
      };
    }
  }
}

// Summary Command
class SummaryCommand extends BaseCommand {
  constructor() {
    super('summary', 'Summarize recent messages', '!summary [hours]', {
      aliases: ['tldr', 'recap'],
      groupOnly: true,
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args, groupId, groupName } = context;

    const hours = parseInt(args) || 24;
    const startDate = dayjs().subtract(hours, 'hour').toDate();

    try {
      // Get recent messages
      const messages = await prisma.message.findMany({
        where: {
          groupId,
          createdAt: { gte: startDate },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          senderName: true,
          senderId: true,
          content: true,
          createdAt: true,
        },
      });

      if (messages.length === 0) {
        return {
          success: true,
          message: `📝 No messages in the last ${hours} hours.`,
        };
      }

      // Get unique participants
      const participants = new Set(messages.map(m => m.senderName || m.senderId));

      // Get most active user
      const userCounts: Record<string, number> = {};
      for (const msg of messages) {
        const user = msg.senderName || msg.senderId;
        userCounts[user] = (userCounts[user] || 0) + 1;
      }
      const mostActive = Object.entries(userCounts).sort((a, b) => b[1] - a[1])[0];

      // Extract topics (simple keyword extraction)
      const allText = messages.map(m => m.content).join(' ').toLowerCase();
      const words = allText.split(/\s+/).filter(w => w.length > 4);
      const wordCounts: Record<string, number> = {};
      for (const word of words) {
        if (!['https', 'about', 'would', 'could', 'should', 'there', 'their', 'these', 'those'].includes(word)) {
          wordCounts[word] = (wordCounts[word] || 0) + 1;
        }
      }
      const topWords = Object.entries(wordCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word]) => word);

      // Build summary
      let summary = `📝 **Chat Summary** (Last ${hours}h)\n`;
      summary += `📍 ${groupName || groupId}\n\n`;

      summary += `📊 **Stats**\n`;
      summary += `• Messages: ${messages.length}\n`;
      summary += `• Participants: ${participants.size}\n`;
      summary += `• Most Active: ${mostActive[0]} (${mostActive[1]} msgs)\n\n`;

      if (topWords.length > 0) {
        summary += `💬 **Topics discussed**\n`;
        summary += topWords.join(', ') + '\n\n';
      }

      summary += `⏰ **Timeframe**\n`;
      summary += `From: ${dayjs(startDate).format('MMM D, h:mm A')}\n`;
      summary += `To: ${dayjs().format('MMM D, h:mm A')}`;

      return {
        success: true,
        message: summary,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to generate summary.',
      };
    }
  }
}

// Search Command
class SearchCommand extends BaseCommand {
  constructor() {
    super('search', 'Search chat history', '!search <keyword>', {
      aliases: ['find', 'grep'],
      groupOnly: true,
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args, groupId } = context;

    if (!args || args.length < 2) {
      return { success: false, message: 'Usage: !search <keyword> (min 2 characters)' };
    }

    const keyword = args.trim();

    try {
      const messages = await prisma.message.findMany({
        where: {
          groupId,
          content: { contains: keyword },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          senderName: true,
          senderId: true,
          content: true,
          createdAt: true,
        },
      });

      if (messages.length === 0) {
        return {
          success: true,
          message: `🔍 No messages found containing "${keyword}"`,
        };
      }

      let results = `🔍 **Search Results for "${keyword}"**\n`;
      results += `Found ${messages.length} message(s)\n\n`;

      for (const msg of messages) {
        const sender = msg.senderName || msg.senderId;
        const time = dayjs(msg.createdAt).format('MMM D, h:mm A');
        const preview = msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '');
        results += `📌 **${sender}** (${time})\n${preview}\n\n`;
      }

      return {
        success: true,
        message: results.trim(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Search failed. Try again later.',
      };
    }
  }
}

// User Stats Command
class UserStatsCommand extends BaseCommand {
  constructor() {
    super('userstats', 'Stats for specific user', '!userstats <phone_number>', {
      aliases: ['ustats', 'userinfo'],
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args, groupId } = context;

    if (!args) {
      return { success: false, message: 'Usage: !userstats <phone_number>' };
    }

    const targetPhone = args.trim().replace(/[^+\d]/g, '');

    try {
      // Get member info
      const member = await prisma.member.findUnique({
        where: { phoneNumber: targetPhone },
      });

      // Get message stats
      const whereClause: { senderId: string; groupId?: string } = { senderId: targetPhone };
      if (groupId) whereClause.groupId = groupId;

      const totalMessages = await prisma.message.count({ where: whereClause });

      // Get recent activity
      const recentMessages = await prisma.message.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      });

      // Get messages by day of week
      const last30Days = dayjs().subtract(30, 'day').toDate();
      const messages = await prisma.message.findMany({
        where: {
          ...whereClause,
          createdAt: { gte: last30Days },
        },
        select: { createdAt: true },
      });

      const dayActivity: Record<string, number> = {};
      for (const msg of messages) {
        const day = dayjs(msg.createdAt).format('ddd');
        dayActivity[day] = (dayActivity[day] || 0) + 1;
      }

      // Build stats
      let stats = `📊 **User Stats**\n`;
      stats += `📱 ${member?.displayName || targetPhone}\n\n`;

      if (member) {
        stats += `👤 Role: ${member.role}\n`;
        stats += `📅 Joined: ${dayjs(member.joinedAt).format('MMM D, YYYY')}\n`;
        if (member.isBanned) stats += `🚫 Status: Banned\n`;
        else if (member.isMuted) stats += `🔇 Status: Muted\n`;
        else stats += `✅ Status: Active\n`;
        stats += '\n';
      }

      stats += `📈 **Activity**\n`;
      stats += `• Total Messages: ${totalMessages}\n`;
      stats += `• Last 30 Days: ${messages.length}\n`;
      
      if (recentMessages.length > 0) {
        stats += `• Last Active: ${dayjs(recentMessages[0].createdAt).format('MMM D, h:mm A')}\n`;
      }

      if (Object.keys(dayActivity).length > 0) {
        stats += '\n📅 **Most Active Days**\n';
        const sortedDays = Object.entries(dayActivity).sort((a, b) => b[1] - a[1]).slice(0, 3);
        for (const [day, count] of sortedDays) {
          stats += `• ${day}: ${count} msgs\n`;
        }
      }

      return {
        success: true,
        message: stats.trim(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get user stats.',
      };
    }
  }
}

// Export Messages Command
class ExportCommand extends BaseCommand {
  constructor() {
    super('export', 'Export chat messages (DM only)', '!export [days]', {
      adminOnly: true,
      dmOnly: true,
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args, groupId } = context;

    const days = parseInt(args) || 7;
    const startDate = dayjs().subtract(days, 'day').toDate();

    try {
      const messages = await prisma.message.findMany({
        where: {
          groupId,
          createdAt: { gte: startDate },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          senderName: true,
          senderId: true,
          content: true,
          createdAt: true,
        },
      });

      if (messages.length === 0) {
        return {
          success: true,
          message: `📄 No messages to export from the last ${days} days.`,
        };
      }

      // Format as text export
      let export_text = `Chat Export - Last ${days} days\n`;
      export_text += `Generated: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}\n`;
      export_text += `Total Messages: ${messages.length}\n`;
      export_text += '='.repeat(50) + '\n\n';

      for (const msg of messages) {
        const time = dayjs(msg.createdAt).format('YYYY-MM-DD HH:mm');
        const sender = msg.senderName || msg.senderId;
        export_text += `[${time}] ${sender}: ${msg.content}\n`;
      }

      // For Signal, we can't send files directly, so send summary
      return {
        success: true,
        message: `📄 **Export Ready**\n\nMessages: ${messages.length}\nPeriod: ${days} days\n\n_Note: Full export would be sent as file attachment if supported._`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to export messages.',
      };
    }
  }
}

// Reports Plugin
export class ReportsPlugin extends BasePlugin {
  constructor() {
    super('reports', 'Chat reporting - reports, summaries, search', '1.0.0');

    // Register commands
    this.registerCommand(new ReportCommand());
    this.registerCommand(new SummaryCommand());
    this.registerCommand(new SearchCommand());
    this.registerCommand(new UserStatsCommand());
    this.registerCommand(new ExportCommand());
  }

  async initialize(): Promise<void> {
    await super.initialize();
    this.log('info', 'Reports plugin initialized');
  }
}

export default ReportsPlugin;
