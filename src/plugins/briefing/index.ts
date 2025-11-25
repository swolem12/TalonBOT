/**
 * TalonBOT Briefing Plugin
 * 
 * Discord-style commands for chat summaries, briefings, and FOMO prevention:
 * !brief - Get briefings on discussions
 * !digest - Daily/weekly digests
 * !catchup - Smart catch-up on missed conversations
 * !highlights - Key highlights from time periods
 * !topics - Extract main discussion topics
 * !timeline - Visual timeline of activity
 */

import { BasePlugin, BaseCommand } from '../base';
import { CommandContext, CommandResult } from '../../types';
import prisma from '../../lib/prisma';
import dayjs from 'dayjs';

/**
 * Parse Discord-style flags from args
 */
interface ParsedArgs {
  subcommand: string;
  flags: Record<string, string>;
  positional: string[];
}

function parseArgs(args: string): ParsedArgs {
  const parts = args.split(/\s+/);
  const result: ParsedArgs = {
    subcommand: '',
    flags: {},
    positional: [],
  };

  let i = 0;
  
  if (parts.length > 0 && !parts[0].startsWith('-')) {
    result.subcommand = parts[0].toLowerCase();
    i = 1;
  }

  while (i < parts.length) {
    const part = parts[i];
    
    if (part.startsWith('--')) {
      const flagName = part.slice(2);
      i++;
      if (i < parts.length && !parts[i].startsWith('-')) {
        result.flags[flagName] = parts[i];
        i++;
      } else {
        result.flags[flagName] = 'true';
      }
    } else if (part.startsWith('-') && part.length === 2) {
      const flagName = part.slice(1);
      i++;
      if (i < parts.length && !parts[i].startsWith('-')) {
        result.flags[flagName] = parts[i];
        i++;
      } else {
        result.flags[flagName] = 'true';
      }
    } else {
      result.positional.push(part);
      i++;
    }
  }

  return result;
}

/**
 * Parse time string to Date
 */
function parseTimeString(timeStr: string): Date {
  const now = dayjs();
  const lower = timeStr.toLowerCase();

  const relMatch = lower.match(/^(\d+)(h|d|w|m)$/);
  if (relMatch) {
    const value = parseInt(relMatch[1]);
    const unit = relMatch[2];
    switch (unit) {
      case 'm': return now.subtract(value, 'minute').toDate();
      case 'h': return now.subtract(value, 'hour').toDate();
      case 'd': return now.subtract(value, 'day').toDate();
      case 'w': return now.subtract(value, 'week').toDate();
    }
  }

  switch (lower) {
    case 'today':
      return now.startOf('day').toDate();
    case 'yesterday':
      return now.subtract(1, 'day').startOf('day').toDate();
    default:
      const hours = parseInt(lower);
      if (!isNaN(hours)) {
        return now.subtract(hours, 'hour').toDate();
      }
      return now.subtract(24, 'hour').toDate();
  }
}

/**
 * Extract keywords/topics from messages
 */
function extractTopics(messages: Array<{ content: string }>): Array<{ topic: string; count: number; messages: number }> {
  const wordCounts: Record<string, number> = {};
  const wordMessages: Record<string, Set<number>> = {};
  
  const stopWords = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for',
    'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his',
    'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my',
    'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if',
    'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like',
    'yeah', 'yes', 'okay', 'ok', 'lol', 'haha', 'gonna', 'gotta', 'dont',
    'https', 'http', 'www', 'com', 'org', 'net'
  ]);

  messages.forEach((msg, idx) => {
    const words = msg.content.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !stopWords.has(w));

    const seenInMessage = new Set<string>();
    
    for (const word of words) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
      
      if (!seenInMessage.has(word)) {
        seenInMessage.add(word);
        if (!wordMessages[word]) wordMessages[word] = new Set();
        wordMessages[word].add(idx);
      }
    }
  });

  return Object.entries(wordMessages)
    .map(([topic, msgSet]) => ({
      topic,
      count: wordCounts[topic],
      messages: msgSet.size,
    }))
    .filter(t => t.messages >= 2)
    .sort((a, b) => b.messages - a.messages)
    .slice(0, 10);
}

// BRIEF COMMAND
class BriefCommand extends BaseCommand {
  constructor() {
    super('brief', 'Get briefings on discussions', '!brief [timeframe]', {
      aliases: ['briefing', 'b'],
      groupOnly: true,
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args, groupId, groupName } = context;
    const timeStr = args || '24h';
    const since = parseTimeString(timeStr);

    try {
      const messages = await prisma.message.findMany({
        where: {
          groupId,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          senderId: true,
          senderName: true,
          content: true,
          createdAt: true,
        },
      });

      if (messages.length === 0) {
        return {
          success: true,
          message: `📋 **Brief** - No messages since ${dayjs(since).format('MMM D, h:mm A')}`,
        };
      }

      const participants = new Set(messages.map(m => m.senderName || m.senderId));
      const topics = extractTopics(messages);

      let brief = `📋 **Brief** (${timeStr})\n`;
      brief += `📍 ${groupName || 'Group'}\n`;
      brief += `⏰ Since ${dayjs(since).format('MMM D, h:mm A')}\n\n`;

      brief += `📊 **Overview**\n`;
      brief += `• ${messages.length} messages\n`;
      brief += `• ${participants.size} participants\n\n`;

      if (topics.length > 0) {
        brief += `💬 **Main Topics**\n`;
        topics.slice(0, 5).forEach((t, i) => {
          brief += `${i + 1}. ${t.topic} (${t.messages} msgs)\n`;
        });
      }

      return { success: true, message: brief.trim() };
    } catch (error) {
      return { success: false, message: 'Failed to generate briefing.' };
    }
  }
}

// CATCHUP COMMAND
class CatchupCommand extends BaseCommand {
  constructor() {
    super('catchup', 'Smart catch-up on what you missed', '!catchup [options]', {
      aliases: ['cu', 'missed', 'fomo'],
      groupOnly: true,
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { sender, groupId } = context;

    try {
      const lastActivity = await prisma.message.findFirst({
        where: { groupId, senderId: sender },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });

      const since = lastActivity?.createdAt || dayjs().subtract(8, 'hour').toDate();
      
      const messages = await prisma.message.findMany({
        where: {
          groupId,
          createdAt: { gt: since },
          senderId: { not: sender },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          senderId: true,
          senderName: true,
          content: true,
          createdAt: true,
        },
      });

      if (messages.length === 0) {
        return {
          success: true,
          message: `✅ **You're all caught up!**\n\nNo new messages since your last activity.`,
        };
      }

      const participants = new Set(messages.map(m => m.senderName || m.senderId));
      const topics = extractTopics(messages);
      const hoursAway = Math.round((Date.now() - since.getTime()) / (1000 * 60 * 60));

      let catchup = `🔔 **Catch-Up Summary**\n`;
      catchup += `⏰ You were away for ~${hoursAway} hours\n\n`;

      catchup += `📊 **What You Missed**\n`;
      catchup += `• ${messages.length} new messages\n`;
      catchup += `• ${participants.size} people chatting\n\n`;

      if (topics.length > 0) {
        catchup += `💬 **Topics Discussed**\n`;
        topics.slice(0, 5).forEach(t => {
          catchup += `• ${t.topic}\n`;
        });
      }

      return { success: true, message: catchup.trim() };
    } catch (error) {
      return { success: false, message: 'Failed to generate catch-up summary.' };
    }
  }
}

// DIGEST COMMAND
class DigestCommand extends BaseCommand {
  constructor() {
    super('digest', 'Get daily/weekly digests', '!digest [daily|weekly]', {
      aliases: ['d'],
      groupOnly: true,
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args, groupId, groupName } = context;
    const parsed = parseArgs(args || 'daily');
    const isWeekly = parsed.subcommand === 'weekly' || parsed.subcommand === 'week';
    
    const since = isWeekly 
      ? dayjs().subtract(7, 'day').startOf('day').toDate()
      : dayjs().startOf('day').toDate();

    try {
      const messages = await prisma.message.findMany({
        where: { groupId, createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
        select: {
          senderId: true,
          senderName: true,
          content: true,
          createdAt: true,
        },
      });

      if (messages.length === 0) {
        return {
          success: true,
          message: `📰 **${isWeekly ? 'Weekly' : 'Daily'} Digest** - No activity yet.`,
        };
      }

      const participants = new Set(messages.map(m => m.senderName || m.senderId));
      const topics = extractTopics(messages);

      const userCounts: Record<string, number> = {};
      messages.forEach(m => {
        const user = m.senderName || m.senderId;
        userCounts[user] = (userCounts[user] || 0) + 1;
      });
      const topUsers = Object.entries(userCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      let digest = `📰 **${isWeekly ? 'Weekly' : 'Daily'} Digest**\n`;
      digest += `📍 ${groupName || 'Group'}\n\n`;

      digest += `📊 **Stats**\n`;
      digest += `• Messages: ${messages.length}\n`;
      digest += `• Participants: ${participants.size}\n\n`;

      digest += `🏆 **Top Contributors**\n`;
      topUsers.forEach(([user, count], i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        digest += `${medal} ${user}: ${count} msgs\n`;
      });

      if (topics.length > 0) {
        digest += `\n💬 **Topics**\n`;
        topics.slice(0, 6).forEach((t, i) => {
          digest += `${i + 1}. ${t.topic}\n`;
        });
      }

      return { success: true, message: digest.trim() };
    } catch {
      return { success: false, message: 'Failed to generate digest.' };
    }
  }
}

// HIGHLIGHTS COMMAND
class HighlightsCommand extends BaseCommand {
  constructor() {
    super('highlights', 'Key highlights from a time period', '!highlights [timeframe]', {
      aliases: ['hl', 'top'],
      groupOnly: true,
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args, groupId } = context;
    const timeStr = args || '24h';
    const since = parseTimeString(timeStr);

    try {
      const messages = await prisma.message.findMany({
        where: { groupId, createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
        include: { reactions: true },
      });

      if (messages.length === 0) {
        return { success: true, message: `✨ No highlights in the specified timeframe.` };
      }

      const popularMessages = messages
        .filter(m => m.reactions.length > 0)
        .sort((a, b) => b.reactions.length - a.reactions.length)
        .slice(0, 5);

      const topics = extractTopics(messages);

      let highlights = `✨ **Highlights** (${timeStr})\n\n`;

      if (popularMessages.length > 0) {
        highlights += `🔥 **Popular Messages**\n`;
        popularMessages.forEach((m, i) => {
          const preview = m.content.substring(0, 60) + (m.content.length > 60 ? '...' : '');
          highlights += `${i + 1}. "${preview}"\n`;
          highlights += `   by ${m.senderName || m.senderId} • ${m.reactions.length} reactions\n`;
        });
        highlights += '\n';
      }

      if (topics.length > 0) {
        highlights += `💬 **Hot Topics**\n`;
        topics.slice(0, 5).forEach((t, i) => {
          highlights += `${i + 1}. ${t.topic} (${t.messages} discussions)\n`;
        });
      }

      highlights += `\n📊 Total messages: ${messages.length}`;

      return { success: true, message: highlights.trim() };
    } catch {
      return { success: false, message: 'Failed to get highlights.' };
    }
  }
}

// TOPICS COMMAND
class TopicsCommand extends BaseCommand {
  constructor() {
    super('topics', 'Extract main discussion topics', '!topics [timeframe]', {
      aliases: ['trending', 'keywords'],
      groupOnly: true,
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args, groupId } = context;
    const timeStr = args || '24h';
    const since = parseTimeString(timeStr);

    try {
      const messages = await prisma.message.findMany({
        where: { groupId, createdAt: { gte: since } },
        select: { content: true },
      });

      if (messages.length === 0) {
        return { success: true, message: `💬 No messages to analyze.` };
      }

      const topics = extractTopics(messages);

      if (topics.length === 0) {
        return { success: true, message: `💬 No clear topics identified. Try a longer timeframe.` };
      }

      let result = `💬 **Discussion Topics** (${timeStr})\n\n`;
      
      topics.forEach((t, i) => {
        const bar = '▓'.repeat(Math.min(t.messages, 10));
        result += `${i + 1}. **${t.topic}**\n`;
        result += `   ${bar} ${t.messages} discussions\n`;
      });

      result += `\n📊 Analyzed ${messages.length} messages`;

      return { success: true, message: result.trim() };
    } catch {
      return { success: false, message: 'Failed to extract topics.' };
    }
  }
}

// TIMELINE COMMAND
class TimelineCommand extends BaseCommand {
  constructor() {
    super('timeline', 'Visual timeline of activity', '!timeline [hours]', {
      aliases: ['tl', 'when'],
      groupOnly: true,
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args, groupId } = context;
    const hours = parseInt(args) || 24;
    const since = dayjs().subtract(hours, 'hour').toDate();

    try {
      const messages = await prisma.message.findMany({
        where: { groupId, createdAt: { gte: since } },
        select: { createdAt: true },
      });

      if (messages.length === 0) {
        return { success: true, message: `📅 No activity in the last ${hours} hours.` };
      }

      const hourlyActivity: Record<string, number> = {};
      
      for (let i = hours - 1; i >= 0; i--) {
        const hourKey = dayjs().subtract(i, 'hour').format('HH:00');
        hourlyActivity[hourKey] = 0;
      }

      messages.forEach(m => {
        const hourKey = dayjs(m.createdAt).format('HH:00');
        if (hourKey in hourlyActivity) {
          hourlyActivity[hourKey]++;
        }
      });

      const maxActivity = Math.max(...Object.values(hourlyActivity), 1);

      let timeline = `📅 **Activity Timeline** (Last ${hours}h)\n\n`;

      const step = hours > 12 ? 3 : hours > 6 ? 2 : 1;
      const entries = Object.entries(hourlyActivity);
      
      for (let i = 0; i < entries.length; i += step) {
        const [hour, count] = entries[i];
        const barLength = Math.round((count / maxActivity) * 10);
        const bar = '█'.repeat(barLength) + '░'.repeat(10 - barLength);
        const time = dayjs().startOf('day').add(parseInt(hour), 'hour').format('h A');
        timeline += `${time.padStart(5)} ${bar} ${count}\n`;
      }

      timeline += `\n📊 Total: ${messages.length} messages`;

      return { success: true, message: timeline.trim() };
    } catch {
      return { success: false, message: 'Failed to generate timeline.' };
    }
  }
}

// BRIEFING PLUGIN
export class BriefingPlugin extends BasePlugin {
  constructor() {
    super('briefing', 'Chat summaries, briefings, and FOMO prevention', '1.0.0');

    this.registerCommand(new BriefCommand());
    this.registerCommand(new CatchupCommand());
    this.registerCommand(new DigestCommand());
    this.registerCommand(new HighlightsCommand());
    this.registerCommand(new TopicsCommand());
    this.registerCommand(new TimelineCommand());
  }

  async initialize(): Promise<void> {
    await super.initialize();
    this.log('info', 'Briefing plugin initialized - FOMO prevention active!');
  }
}

export default BriefingPlugin;
