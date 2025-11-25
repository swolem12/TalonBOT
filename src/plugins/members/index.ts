/**
 * TalonBOT Members Plugin
 * 
 * Discord-style member management with subcommands and flags:
 * !member list | info | kick | warn
 * !ban add | remove | list
 * !mute add | remove
 * !mod add | remove | list
 */

import { BasePlugin, BaseCommand } from '../base';
import { CommandContext, CommandResult } from '../../types';
import prisma from '../../lib/prisma';
import dayjs from 'dayjs';

/**
 * Parse Discord-style flags from args
 * Example: "!ban add +1234567890 --reason spam --duration 7d"
 */
interface ParsedArgs {
  subcommand: string;
  target: string;
  flags: Record<string, string>;
  positional: string[];
}

function parseArgs(args: string): ParsedArgs {
  const parts = args.split(/\s+/);
  const result: ParsedArgs = {
    subcommand: '',
    target: '',
    flags: {},
    positional: [],
  };

  let i = 0;
  
  // First part is subcommand
  if (parts.length > 0 && !parts[0].startsWith('-') && !parts[0].startsWith('+')) {
    result.subcommand = parts[0].toLowerCase();
    i = 1;
  }

  // Parse remaining parts
  while (i < parts.length) {
    const part = parts[i];
    
    if (part.startsWith('--')) {
      // Long flag: --reason "spam messages"
      const flagName = part.slice(2);
      i++;
      
      // Collect value (could be quoted)
      if (i < parts.length && !parts[i].startsWith('-')) {
        let value = parts[i];
        // Handle quoted values
        if (value.startsWith('"') && !value.endsWith('"')) {
          while (i + 1 < parts.length && !parts[i].endsWith('"')) {
            i++;
            value += ' ' + parts[i];
          }
          value = value.replace(/^"|"$/g, '');
        }
        result.flags[flagName] = value;
        i++;
      } else {
        result.flags[flagName] = 'true';
      }
    } else if (part.startsWith('-') && part.length === 2) {
      // Short flag: -r spam
      const flagName = part.slice(1);
      i++;
      if (i < parts.length && !parts[i].startsWith('-')) {
        result.flags[flagName] = parts[i];
        i++;
      } else {
        result.flags[flagName] = 'true';
      }
    } else if (part.startsWith('+')) {
      // Phone number
      result.target = part;
      i++;
    } else {
      result.positional.push(part);
      i++;
    }
  }

  // If no target found, check positional args
  if (!result.target && result.positional.length > 0) {
    const phoneCandidate = result.positional.find(p => /^\+?\d{10,}$/.test(p.replace(/[^+\d]/g, '')));
    if (phoneCandidate) {
      result.target = phoneCandidate.replace(/[^+\d]/g, '');
      result.positional = result.positional.filter(p => p !== phoneCandidate);
    }
  }

  return result;
}

/**
 * Parse duration string (e.g., "30m", "2h", "7d") to minutes
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(m|h|d|w)?$/i);
  if (!match) return 30; // Default 30 minutes

  const value = parseInt(match[1]);
  const unit = (match[2] || 'm').toLowerCase();

  switch (unit) {
    case 'm': return value;
    case 'h': return value * 60;
    case 'd': return value * 60 * 24;
    case 'w': return value * 60 * 24 * 7;
    default: return value;
  }
}

// =====================================================
// MEMBER COMMAND - !member <subcommand>
// =====================================================
class MemberCommand extends BaseCommand {
  constructor() {
    super('member', 'Member management with subcommands', '!member <list|info|kick|warn> [options]', {
      aliases: ['m', 'user'],
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args } = context;

    if (!args) {
      return this.showHelp();
    }

    const parsed = parseArgs(args);

    switch (parsed.subcommand) {
      case 'list':
      case 'ls':
        return this.listMembers(context, parsed);
      case 'info':
      case 'i':
        return this.memberInfo(context, parsed);
      case 'kick':
      case 'k':
        return this.kickMember(context, parsed);
      case 'warn':
      case 'w':
        return this.warnMember(context, parsed);
      default:
        return this.showHelp();
    }
  }

  private showHelp(): CommandResult {
    return {
      success: true,
      message: `
👥 **Member Command**

**Subcommands:**
• \`!member list\` - List all members
• \`!member list --role admin\` - Filter by role
• \`!member info +1234567890\` - Show member info
• \`!member kick +1234567890 --reason "spam"\` - Kick member
• \`!member warn +1234567890 --reason "warning"\` - Warn member

**Flags:**
• \`--reason\` or \`-r\` - Specify reason
• \`--role\` - Filter by role (admin/mod/member)
• \`--silent\` or \`-s\` - Don't notify user

**Aliases:** !m, !user
`.trim(),
    };
  }

  private async listMembers(context: CommandContext, parsed: ParsedArgs): Promise<CommandResult> {
    try {
      const roleFilter = parsed.flags['role'];
      const where: Record<string, unknown> = { isActive: true };
      
      if (roleFilter) {
        where['role'] = roleFilter === 'mod' ? 'moderator' : roleFilter;
      }

      const members = await prisma.member.findMany({
        where,
        orderBy: { lastSeenAt: 'desc' },
        take: 50,
      });

      if (members.length === 0) {
        return {
          success: true,
          message: '📋 No members found. Members are tracked when they send messages.',
        };
      }

      let list = `👥 **Members** (${members.length})\n\n`;

      for (const member of members) {
        const icon = member.role === 'admin' ? '👑' : 
                     member.role === 'moderator' ? '🛡️' : 
                     member.isBanned ? '🚫' : 
                     member.isMuted ? '🔇' : '👤';
        const name = member.displayName || member.phoneNumber;
        const lastSeen = dayjs(member.lastSeenAt).format('MMM D');
        list += `${icon} ${name}\n`;
      }

      return { success: true, message: list.trim() };
    } catch {
      return { success: false, message: 'Failed to list members.' };
    }
  }

  private async memberInfo(context: CommandContext, parsed: ParsedArgs): Promise<CommandResult> {
    if (!parsed.target) {
      return { success: false, message: 'Usage: `!member info +1234567890`' };
    }

    try {
      const member = await prisma.member.findUnique({
        where: { phoneNumber: parsed.target },
      });

      if (!member) {
        return { success: false, message: `Member ${parsed.target} not found.` };
      }

      const msgCount = await prisma.message.count({
        where: { senderId: parsed.target },
      });

      let info = `📋 **Member Info**\n\n`;
      info += `📱 Phone: ${member.phoneNumber}\n`;
      info += `👤 Name: ${member.displayName || 'Unknown'}\n`;
      info += `🏷️ Role: ${member.role}\n`;
      info += `📅 Joined: ${dayjs(member.joinedAt).format('MMM D, YYYY')}\n`;
      info += `💬 Messages: ${msgCount}\n`;
      info += `⏰ Last seen: ${dayjs(member.lastSeenAt).format('MMM D, h:mm A')}\n\n`;

      if (member.isBanned) info += `🚫 **Status: BANNED**\n`;
      else if (member.isMuted) {
        const until = member.muteExpiresAt ? dayjs(member.muteExpiresAt).format('MMM D, h:mm A') : 'indefinitely';
        info += `🔇 **Status: MUTED** until ${until}\n`;
      } else {
        info += `✅ **Status: Active**\n`;
      }

      return { success: true, message: info.trim() };
    } catch {
      return { success: false, message: 'Failed to get member info.' };
    }
  }

  private async kickMember(context: CommandContext, parsed: ParsedArgs): Promise<CommandResult> {
    if (!context.isAdmin) {
      return { success: false, message: '❌ Admin only command.' };
    }

    if (!context.groupId) {
      return { success: false, message: '❌ This command only works in groups.' };
    }

    if (!parsed.target) {
      return { success: false, message: 'Usage: `!member kick +1234567890 --reason "spam"`' };
    }

    const reason = parsed.flags['reason'] || parsed.flags['r'] || 'No reason provided';
    const silent = parsed.flags['silent'] === 'true' || parsed.flags['s'] === 'true';

    try {
      await prisma.member.upsert({
        where: { phoneNumber: parsed.target },
        update: { isActive: false },
        create: { phoneNumber: parsed.target, isActive: false },
      });

      await prisma.adminEvent.create({
        data: {
          eventType: 'kick',
          adminId: context.sender,
          adminName: context.senderName,
          targetId: parsed.target,
          groupId: context.groupId,
          details: reason,
        },
      });

      let msg = `✅ **Kicked** ${parsed.target}\n📝 Reason: ${reason}`;
      if (!silent) {
        msg += `\n\n⚠️ _Bot must be group admin to actually remove from Signal._`;
      }

      return { success: true, message: msg };
    } catch {
      return { success: false, message: 'Failed to kick member.' };
    }
  }

  private async warnMember(context: CommandContext, parsed: ParsedArgs): Promise<CommandResult> {
    if (!context.isModerator && !context.isAdmin) {
      return { success: false, message: '❌ Moderator or Admin only.' };
    }

    if (!parsed.target) {
      return { success: false, message: 'Usage: `!member warn +1234567890 --reason "warning"`' };
    }

    const reason = parsed.flags['reason'] || parsed.flags['r'] || 'Please follow the rules.';

    try {
      await prisma.adminEvent.create({
        data: {
          eventType: 'warn',
          adminId: context.sender,
          adminName: context.senderName,
          targetId: parsed.target,
          groupId: context.groupId,
          details: reason,
        },
      });

      return {
        success: true,
        message: `⚠️ **Warning issued** to ${parsed.target}\n📝 Reason: ${reason}`,
      };
    } catch {
      return { success: false, message: 'Failed to issue warning.' };
    }
  }
}

// =====================================================
// BAN COMMAND - !ban <subcommand>
// =====================================================
class BanCommand extends BaseCommand {
  constructor() {
    super('ban', 'Ban management', '!ban <add|remove|list> [options]', {
      aliases: ['b'],
      adminOnly: true,
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args } = context;

    if (!args) {
      return this.showHelp();
    }

    const parsed = parseArgs(args);

    switch (parsed.subcommand) {
      case 'add':
      case 'a':
        return this.addBan(context, parsed);
      case 'remove':
      case 'rm':
      case 'del':
        return this.removeBan(context, parsed);
      case 'list':
      case 'ls':
        return this.listBans(context);
      default:
        // If no subcommand but has target, assume "add"
        if (parsed.target || parsed.positional.length > 0) {
          if (!parsed.target && parsed.positional.length > 0) {
            parsed.target = parsed.positional[0].replace(/[^+\d]/g, '');
          }
          return this.addBan(context, parsed);
        }
        return this.showHelp();
    }
  }

  private showHelp(): CommandResult {
    return {
      success: true,
      message: `
🚫 **Ban Command**

**Subcommands:**
• \`!ban add +1234567890\` - Ban a user
• \`!ban add +1234567890 --reason "spam" --duration 7d\`
• \`!ban remove +1234567890\` - Unban a user
• \`!ban list\` - Show all banned users

**Flags:**
• \`--reason\` or \`-r\` - Ban reason
• \`--duration\` or \`-d\` - Ban duration (e.g., 30m, 2h, 7d, 1w)

**Shortcut:** \`!ban +1234567890 reason\`
**Aliases:** !b
`.trim(),
    };
  }

  private async addBan(context: CommandContext, parsed: ParsedArgs): Promise<CommandResult> {
    if (!parsed.target) {
      return { success: false, message: 'Usage: `!ban add +1234567890 --reason "spam"`' };
    }

    if (!parsed.target.startsWith('+')) {
      parsed.target = '+' + parsed.target;
    }

    const reason = parsed.flags['reason'] || parsed.flags['r'] || parsed.positional.join(' ') || 'No reason provided';
    const durationStr = parsed.flags['duration'] || parsed.flags['d'];
    
    let banExpiresAt: Date | null = null;
    if (durationStr) {
      const minutes = parseDuration(durationStr);
      banExpiresAt = new Date(Date.now() + minutes * 60 * 1000);
    }

    try {
      await prisma.member.upsert({
        where: { phoneNumber: parsed.target },
        update: { isBanned: true, isActive: false },
        create: { phoneNumber: parsed.target, isBanned: true, isActive: false },
      });

      await prisma.adminEvent.create({
        data: {
          eventType: 'ban',
          adminId: context.sender,
          adminName: context.senderName,
          targetId: parsed.target,
          groupId: context.groupId,
          details: `${reason}${banExpiresAt ? ` (until ${dayjs(banExpiresAt).format('MMM D, h:mm A')})` : ''}`,
        },
      });

      let msg = `🚫 **Banned** ${parsed.target}\n📝 Reason: ${reason}`;
      if (banExpiresAt) {
        msg += `\n⏰ Until: ${dayjs(banExpiresAt).format('MMM D, YYYY h:mm A')}`;
      }

      return { success: true, message: msg };
    } catch {
      return { success: false, message: 'Failed to ban user.' };
    }
  }

  private async removeBan(context: CommandContext, parsed: ParsedArgs): Promise<CommandResult> {
    if (!parsed.target) {
      return { success: false, message: 'Usage: `!ban remove +1234567890`' };
    }

    try {
      await prisma.member.update({
        where: { phoneNumber: parsed.target },
        data: { isBanned: false },
      });

      await prisma.adminEvent.create({
        data: {
          eventType: 'unban',
          adminId: context.sender,
          adminName: context.senderName,
          targetId: parsed.target,
          groupId: context.groupId,
          details: 'Ban removed',
        },
      });

      return { success: true, message: `✅ **Unbanned** ${parsed.target}` };
    } catch {
      return { success: false, message: 'User not found or could not be unbanned.' };
    }
  }

  private async listBans(context: CommandContext): Promise<CommandResult> {
    try {
      const banned = await prisma.member.findMany({
        where: { isBanned: true },
        orderBy: { joinedAt: 'desc' },
      });

      if (banned.length === 0) {
        return { success: true, message: '✅ No banned users.' };
      }

      let list = `🚫 **Banned Users** (${banned.length})\n\n`;
      for (const member of banned) {
        const name = member.displayName || member.phoneNumber;
        list += `• ${name}\n`;
      }

      return { success: true, message: list.trim() };
    } catch {
      return { success: false, message: 'Failed to list banned users.' };
    }
  }
}

// =====================================================
// MUTE COMMAND - !mute <subcommand>
// =====================================================
class MuteCommand extends BaseCommand {
  constructor() {
    super('mute', 'Mute management', '!mute <add|remove|list> [options]', {
      aliases: ['silence', 'timeout'],
      moderatorOnly: true,
      groupOnly: true,
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args } = context;

    if (!args) {
      return this.showHelp();
    }

    const parsed = parseArgs(args);

    switch (parsed.subcommand) {
      case 'add':
      case 'a':
        return this.addMute(context, parsed);
      case 'remove':
      case 'rm':
      case 'del':
        return this.removeMute(context, parsed);
      case 'list':
      case 'ls':
        return this.listMutes(context);
      default:
        // If no subcommand but has target, assume "add"
        if (parsed.target || parsed.positional.length > 0) {
          if (!parsed.target && parsed.positional.length > 0) {
            parsed.target = parsed.positional[0].replace(/[^+\d]/g, '');
          }
          return this.addMute(context, parsed);
        }
        return this.showHelp();
    }
  }

  private showHelp(): CommandResult {
    return {
      success: true,
      message: `
🔇 **Mute Command**

**Subcommands:**
• \`!mute add +1234567890\` - Mute for 30 mins (default)
• \`!mute add +1234567890 --duration 2h --reason "spam"\`
• \`!mute remove +1234567890\` - Unmute a user
• \`!mute list\` - Show all muted users

**Flags:**
• \`--duration\` or \`-d\` - Duration (e.g., 30m, 2h, 1d)
• \`--reason\` or \`-r\` - Mute reason

**Shortcut:** \`!mute +1234567890 30m\`
**Aliases:** !silence, !timeout
`.trim(),
    };
  }

  private async addMute(context: CommandContext, parsed: ParsedArgs): Promise<CommandResult> {
    if (!parsed.target) {
      return { success: false, message: 'Usage: `!mute add +1234567890 --duration 1h`' };
    }

    if (!parsed.target.startsWith('+')) {
      parsed.target = '+' + parsed.target;
    }

    const durationStr = parsed.flags['duration'] || parsed.flags['d'] || parsed.positional[0] || '30m';
    const reason = parsed.flags['reason'] || parsed.flags['r'] || 'No reason provided';
    const minutes = parseDuration(durationStr);
    const muteExpiresAt = new Date(Date.now() + minutes * 60 * 1000);

    try {
      await prisma.member.upsert({
        where: { phoneNumber: parsed.target },
        update: { isMuted: true, muteExpiresAt },
        create: { phoneNumber: parsed.target, isMuted: true, muteExpiresAt },
      });

      await prisma.adminEvent.create({
        data: {
          eventType: 'mute',
          adminId: context.sender,
          adminName: context.senderName,
          targetId: parsed.target,
          groupId: context.groupId,
          details: `${reason} (${minutes} minutes)`,
        },
      });

      const durationDisplay = minutes >= 60 
        ? `${Math.round(minutes / 60)}h` 
        : `${minutes}m`;

      return {
        success: true,
        message: `🔇 **Muted** ${parsed.target}\n⏰ Duration: ${durationDisplay}\n📝 Reason: ${reason}`,
      };
    } catch {
      return { success: false, message: 'Failed to mute user.' };
    }
  }

  private async removeMute(context: CommandContext, parsed: ParsedArgs): Promise<CommandResult> {
    if (!parsed.target) {
      return { success: false, message: 'Usage: `!mute remove +1234567890`' };
    }

    try {
      await prisma.member.update({
        where: { phoneNumber: parsed.target },
        data: { isMuted: false, muteExpiresAt: null },
      });

      await prisma.adminEvent.create({
        data: {
          eventType: 'unmute',
          adminId: context.sender,
          adminName: context.senderName,
          targetId: parsed.target,
          groupId: context.groupId,
          details: 'Unmuted',
        },
      });

      return { success: true, message: `🔊 **Unmuted** ${parsed.target}` };
    } catch {
      return { success: false, message: 'User not found or could not be unmuted.' };
    }
  }

  private async listMutes(context: CommandContext): Promise<CommandResult> {
    try {
      const muted = await prisma.member.findMany({
        where: { isMuted: true },
        orderBy: { muteExpiresAt: 'asc' },
      });

      if (muted.length === 0) {
        return { success: true, message: '✅ No muted users.' };
      }

      let list = `🔇 **Muted Users** (${muted.length})\n\n`;
      for (const member of muted) {
        const name = member.displayName || member.phoneNumber;
        const until = member.muteExpiresAt 
          ? dayjs(member.muteExpiresAt).format('MMM D, h:mm A')
          : 'indefinitely';
        list += `• ${name} (until ${until})\n`;
      }

      return { success: true, message: list.trim() };
    } catch {
      return { success: false, message: 'Failed to list muted users.' };
    }
  }
}

// =====================================================
// MOD COMMAND - !mod <subcommand>
// =====================================================
class ModCommand extends BaseCommand {
  constructor() {
    super('mod', 'Moderator management', '!mod <add|remove|list> [options]', {
      aliases: ['moderator'],
      adminOnly: true,
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args } = context;

    if (!args) {
      return this.showHelp();
    }

    const parsed = parseArgs(args);

    switch (parsed.subcommand) {
      case 'add':
      case 'a':
        return this.addMod(context, parsed);
      case 'remove':
      case 'rm':
      case 'del':
        return this.removeMod(context, parsed);
      case 'list':
      case 'ls':
        return this.listMods(context);
      default:
        return this.showHelp();
    }
  }

  private showHelp(): CommandResult {
    return {
      success: true,
      message: `
🛡️ **Mod Command**

**Subcommands:**
• \`!mod add +1234567890\` - Promote to moderator
• \`!mod remove +1234567890\` - Demote to member
• \`!mod list\` - Show all moderators

**Aliases:** !moderator
`.trim(),
    };
  }

  private async addMod(context: CommandContext, parsed: ParsedArgs): Promise<CommandResult> {
    if (!parsed.target) {
      return { success: false, message: 'Usage: `!mod add +1234567890`' };
    }

    try {
      await prisma.member.upsert({
        where: { phoneNumber: parsed.target },
        update: { role: 'moderator' },
        create: { phoneNumber: parsed.target, role: 'moderator' },
      });

      await prisma.adminEvent.create({
        data: {
          eventType: 'promote',
          adminId: context.sender,
          adminName: context.senderName,
          targetId: parsed.target,
          groupId: context.groupId,
          details: 'Promoted to moderator',
        },
      });

      return { success: true, message: `🛡️ **Promoted** ${parsed.target} to moderator` };
    } catch {
      return { success: false, message: 'Failed to promote user.' };
    }
  }

  private async removeMod(context: CommandContext, parsed: ParsedArgs): Promise<CommandResult> {
    if (!parsed.target) {
      return { success: false, message: 'Usage: `!mod remove +1234567890`' };
    }

    try {
      await prisma.member.update({
        where: { phoneNumber: parsed.target },
        data: { role: 'member' },
      });

      await prisma.adminEvent.create({
        data: {
          eventType: 'demote',
          adminId: context.sender,
          adminName: context.senderName,
          targetId: parsed.target,
          groupId: context.groupId,
          details: 'Demoted to member',
        },
      });

      return { success: true, message: `👤 **Demoted** ${parsed.target} to member` };
    } catch {
      return { success: false, message: 'User not found or could not be demoted.' };
    }
  }

  private async listMods(context: CommandContext): Promise<CommandResult> {
    try {
      const mods = await prisma.member.findMany({
        where: { 
          OR: [
            { role: 'moderator' },
            { role: 'admin' }
          ]
        },
        orderBy: { role: 'asc' },
      });

      if (mods.length === 0) {
        return { success: true, message: '👤 No moderators or admins found.' };
      }

      let list = `🛡️ **Staff Members** (${mods.length})\n\n`;
      for (const member of mods) {
        const icon = member.role === 'admin' ? '👑' : '🛡️';
        const name = member.displayName || member.phoneNumber;
        list += `${icon} ${name} (${member.role})\n`;
      }

      return { success: true, message: list.trim() };
    } catch {
      return { success: false, message: 'Failed to list staff.' };
    }
  }
}

// =====================================================
// ADMIN COMMAND - !admin <subcommand>
// =====================================================
class AdminCommand extends BaseCommand {
  constructor() {
    super('admin', 'Admin-only utilities', '!admin <logs|clear|config>', {
      adminOnly: true,
    });
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const { args } = context;

    if (!args) {
      return this.showHelp();
    }

    const parsed = parseArgs(args);

    switch (parsed.subcommand) {
      case 'logs':
        return this.showLogs(context, parsed);
      case 'clear':
        return this.clearLogs(context, parsed);
      default:
        return this.showHelp();
    }
  }

  private showHelp(): CommandResult {
    return {
      success: true,
      message: `
👑 **Admin Command**

**Subcommands:**
• \`!admin logs\` - Show recent admin actions
• \`!admin logs --type ban\` - Filter by action type
• \`!admin clear --confirm\` - Clear old logs

**Log Types:** kick, ban, unban, mute, unmute, warn, promote, demote
`.trim(),
    };
  }

  private async showLogs(context: CommandContext, parsed: ParsedArgs): Promise<CommandResult> {
    const typeFilter = parsed.flags['type'] || parsed.flags['t'];
    const limit = parseInt(parsed.flags['limit'] || parsed.flags['l'] || '10');

    try {
      const where: Record<string, unknown> = {};
      if (typeFilter) where['eventType'] = typeFilter;

      const logs = await prisma.adminEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: Math.min(limit, 25),
      });

      if (logs.length === 0) {
        return { success: true, message: '📋 No admin logs found.' };
      }

      let list = `📋 **Admin Logs** (${logs.length})\n\n`;
      for (const log of logs) {
        const time = dayjs(log.timestamp).format('MMM D, h:mm A');
        const admin = log.adminName || log.adminId;
        list += `**${log.eventType.toUpperCase()}** - ${time}\n`;
        list += `  By: ${admin}\n`;
        list += `  Target: ${log.targetId || 'N/A'}\n`;
        if (log.details) list += `  Details: ${log.details}\n`;
        list += '\n';
      }

      return { success: true, message: list.trim() };
    } catch {
      return { success: false, message: 'Failed to fetch logs.' };
    }
  }

  private async clearLogs(context: CommandContext, parsed: ParsedArgs): Promise<CommandResult> {
    if (parsed.flags['confirm'] !== 'true') {
      return { success: false, message: 'Use `!admin clear --confirm` to clear old logs.' };
    }

    try {
      const thirtyDaysAgo = dayjs().subtract(30, 'day').toDate();
      const result = await prisma.adminEvent.deleteMany({
        where: { timestamp: { lt: thirtyDaysAgo } },
      });

      return { success: true, message: `✅ Cleared ${result.count} logs older than 30 days.` };
    } catch {
      return { success: false, message: 'Failed to clear logs.' };
    }
  }
}

// =====================================================
// MEMBERS PLUGIN
// =====================================================
export class MembersPlugin extends BasePlugin {
  constructor() {
    super('members', 'Discord-style member management', '1.0.0');

    // Register commands with subcommands
    this.registerCommand(new MemberCommand());
    this.registerCommand(new BanCommand());
    this.registerCommand(new MuteCommand());
    this.registerCommand(new ModCommand());
    this.registerCommand(new AdminCommand());
  }

  async initialize(): Promise<void> {
    await super.initialize();
    this.log('info', 'Members plugin initialized with Discord-style commands');
    
    // Start mute expiration checker
    this.startMuteExpirationChecker();
  }

  /**
   * Check for expired mutes every minute
   */
  private startMuteExpirationChecker(): void {
    setInterval(async () => {
      try {
        const now = new Date();
        const expiredMutes = await prisma.member.findMany({
          where: {
            isMuted: true,
            muteExpiresAt: { lte: now },
          },
        });

        for (const member of expiredMutes) {
          await prisma.member.update({
            where: { phoneNumber: member.phoneNumber },
            data: { isMuted: false, muteExpiresAt: null },
          });
          this.log('info', `Auto-unmuted ${member.phoneNumber}`);
        }
      } catch (error) {
        this.log('error', 'Failed to check mute expirations:', error);
      }
    }, 60000); // Check every minute
  }
}

export default MembersPlugin;
