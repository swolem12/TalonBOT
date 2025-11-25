/**
 * TalonBOT - Signal Chatbot for Team Talon
 * 
 * Main entry point
 */

import { loadConfig, config } from './lib/config';
import { SignalCliService } from './lib/signal-cli';
import logger from './lib/logger';
import prisma from './lib/prisma';
import { BasePlugin } from './plugins/base';
import { CommandContext, SignalDataMessage, SignalGroupInfo, TalonBot, BotConfig, MemberInfo } from './types';

// Import plugins
import CorePlugin from './plugins/core';
import MembersPlugin from './plugins/members';
import ReportsPlugin from './plugins/reports';
import AnalyticsPlugin from './plugins/analytics';

class TalonBotService implements TalonBot {
  config: BotConfig;
  private signalCli: SignalCliService;
  private plugins: Map<string, BasePlugin> = new Map();
  private isRunning = false;

  constructor() {
    this.config = config;
    this.signalCli = new SignalCliService(config);
  }

  /**
   * Initialize and start the bot
   */
  async start(): Promise<void> {
    logger.info('🤖 Starting TalonBOT...');

    // Initialize database
    await this.initDatabase();

    // Load plugins
    this.loadPlugins();

    // Start Signal CLI service
    await this.signalCli.start();

    // Set up message handlers
    this.setupMessageHandlers();

    this.isRunning = true;
    logger.info('✅ TalonBOT is now running!');
    logger.info(`📱 Bot phone number: ${this.config.phoneNumber}`);
    logger.info(`🔧 Command prefix: ${this.config.prefix}`);
    logger.info(`📦 Loaded plugins: ${Array.from(this.plugins.keys()).join(', ')}`);
  }

  /**
   * Stop the bot
   */
  async stop(): Promise<void> {
    logger.info('🛑 Stopping TalonBOT...');

    // Shutdown plugins
    for (const plugin of this.plugins.values()) {
      await plugin.shutdown?.();
    }

    // Stop Signal CLI
    await this.signalCli.stop();

    // Disconnect database
    await prisma.$disconnect();

    this.isRunning = false;
    logger.info('👋 TalonBOT stopped');
  }

  /**
   * Initialize database connection
   */
  private async initDatabase(): Promise<void> {
    try {
      await prisma.$connect();
      logger.info('✅ Database connected');
    } catch (error) {
      logger.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  /**
   * Load all plugins
   */
  private loadPlugins(): void {
    const pluginClasses = [
      CorePlugin,
      MembersPlugin,
      ReportsPlugin,
      AnalyticsPlugin,
    ];

    for (const PluginClass of pluginClasses) {
      const plugin = new PluginClass();
      plugin.setBot(this);
      plugin.initialize?.();
      this.plugins.set(plugin.name, plugin);
      logger.debug(`Loaded plugin: ${plugin.name} v${plugin.version}`);
    }
  }

  /**
   * Set up message handlers
   */
  private setupMessageHandlers(): void {
    // Handle incoming messages
    this.signalCli.on('message', async (data: {
      source: string;
      sourceName?: string;
      sourceUuid?: string;
      timestamp: number;
      dataMessage: SignalDataMessage;
      groupInfo?: SignalGroupInfo;
    }) => {
      try {
        await this.handleMessage(data);
      } catch (error) {
        logger.error('Error handling message:', error);
      }
    });

    // Handle reactions
    this.signalCli.on('reaction', async (data: {
      source: string;
      sourceName?: string;
      timestamp: number;
      reaction: { emoji: string; targetAuthor: string; targetSentTimestamp: number; isRemove?: boolean };
      groupInfo?: SignalGroupInfo;
    }) => {
      try {
        await this.handleReaction(data);
      } catch (error) {
        logger.error('Error handling reaction:', error);
      }
    });

    // Handle errors
    this.signalCli.on('error', (error: Error) => {
      logger.error('Signal CLI error:', error);
    });

    // Handle exit
    this.signalCli.on('exit', (code: number) => {
      logger.warn(`Signal CLI exited with code ${code}`);
      if (this.isRunning) {
        logger.info('Attempting to restart Signal CLI...');
        setTimeout(() => this.signalCli.start(), 5000);
      }
    });
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(data: {
    source: string;
    sourceName?: string;
    sourceUuid?: string;
    timestamp: number;
    dataMessage: SignalDataMessage;
    groupInfo?: SignalGroupInfo;
  }): Promise<void> {
    const { source, sourceName, timestamp, dataMessage, groupInfo } = data;
    const message = dataMessage.message;

    if (!message) return;

    // Update member last seen
    await this.updateMemberActivity(source, sourceName);

    // Store message if enabled
    if (this.config.storeMessages) {
      await this.storeMessage({
        source,
        sourceName,
        timestamp,
        message,
        groupId: groupInfo?.groupId,
        groupName: groupInfo?.name,
      });
    }

    // Check if it's a command
    if (!message.startsWith(this.config.prefix)) {
      return;
    }

    // Parse command
    const commandLine = message.slice(this.config.prefix.length).trim();
    const spaceIndex = commandLine.indexOf(' ');
    const command = spaceIndex > 0 ? commandLine.slice(0, spaceIndex).toLowerCase() : commandLine.toLowerCase();
    const args = spaceIndex > 0 ? commandLine.slice(spaceIndex + 1).trim() : '';

    // Check if user is muted
    const member = await prisma.member.findUnique({
      where: { phoneNumber: source },
    });

    if (member?.isMuted) {
      // Silently ignore muted users
      logger.debug(`Ignoring command from muted user: ${source}`);
      return;
    }

    if (member?.isBanned) {
      // Silently ignore banned users
      logger.debug(`Ignoring command from banned user: ${source}`);
      return;
    }

    // Build command context
    const context: CommandContext = {
      sender: source,
      senderName: sourceName,
      groupId: groupInfo?.groupId,
      groupName: groupInfo?.name,
      message,
      command,
      args,
      timestamp,
      bot: this,
      isAdmin: this.isAdmin(source),
      isModerator: await this.isModerator(source),
    };

    // Find and execute command
    await this.executeCommand(context);
  }

  /**
   * Execute a command
   */
  private async executeCommand(context: CommandContext): Promise<void> {
    logger.info(`Command: ${context.command} from ${context.senderName || context.sender}`);

    // Find plugin that handles this command
    for (const plugin of this.plugins.values()) {
      if (plugin.hasCommand(context.command)) {
        const result = await plugin.executeCommand(context);
        
        if (result.message) {
          await this.sendMessage(context.sender, result.message, context.groupId);
        }
        
        return;
      }
    }

    // Command not found
    await this.sendMessage(
      context.sender,
      `❓ Unknown command: ${context.command}\nUse ${this.config.prefix}help to see available commands.`,
      context.groupId
    );
  }

  /**
   * Handle reaction
   */
  private async handleReaction(data: {
    source: string;
    sourceName?: string;
    timestamp: number;
    reaction: { emoji: string; targetAuthor: string; targetSentTimestamp: number; isRemove?: boolean };
    groupInfo?: SignalGroupInfo;
  }): Promise<void> {
    const { source, sourceName, reaction, groupInfo } = data;

    if (reaction.isRemove) return;

    // Store reaction
    try {
      // Find the message being reacted to
      const message = await prisma.message.findFirst({
        where: {
          timestamp: BigInt(reaction.targetSentTimestamp),
          senderId: reaction.targetAuthor,
        },
      });

      if (message) {
        await prisma.reaction.create({
          data: {
            messageId: message.id,
            emoji: reaction.emoji,
            reactorNumber: source,
            reactorName: sourceName,
            timestamp: BigInt(data.timestamp),
          },
        });
      }
    } catch (error) {
      // Ignore duplicate reactions
      logger.debug('Reaction storage failed (likely duplicate)');
    }
  }

  /**
   * Store message in database
   */
  private async storeMessage(data: {
    source: string;
    sourceName?: string;
    timestamp: number;
    message: string;
    groupId?: string;
    groupName?: string;
  }): Promise<void> {
    try {
      await prisma.message.create({
        data: {
          groupId: data.groupId || null,
          groupName: data.groupName || null,
          senderId: data.source,
          senderName: data.sourceName || null,
          content: data.message,
          timestamp: BigInt(data.timestamp),
        },
      });
    } catch (error) {
      logger.debug('Failed to store message:', error);
    }
  }

  /**
   * Update member activity
   */
  private async updateMemberActivity(phoneNumber: string, displayName?: string): Promise<void> {
    try {
      await prisma.member.upsert({
        where: { phoneNumber },
        update: {
          lastSeenAt: new Date(),
          displayName: displayName || undefined,
        },
        create: {
          phoneNumber,
          displayName,
          lastSeenAt: new Date(),
        },
      });
    } catch (error) {
      logger.debug('Failed to update member activity:', error);
    }
  }

  /**
   * Check if user is admin
   */
  private isAdmin(phoneNumber: string): boolean {
    return this.config.adminUsers.includes(phoneNumber) ||
           this.config.masterAdmin === phoneNumber;
  }

  /**
   * Check if user is moderator
   */
  private async isModerator(phoneNumber: string): Promise<boolean> {
    const member = await prisma.member.findUnique({
      where: { phoneNumber },
    });
    return member?.role === 'moderator' || member?.role === 'admin';
  }

  // ===============================
  // TalonBot Interface Implementation
  // ===============================

  async sendMessage(recipient: string, message: string, groupId?: string): Promise<void> {
    try {
      await this.signalCli.sendMessage({
        recipient: groupId ? undefined : recipient,
        groupId,
        message,
      });
    } catch (error) {
      logger.error('Failed to send message:', error);
      throw error;
    }
  }

  async sendReaction(recipient: string, emoji: string, targetTimestamp: number, groupId?: string): Promise<void> {
    try {
      await this.signalCli.sendReaction(recipient, targetTimestamp, emoji, groupId);
    } catch (error) {
      logger.error('Failed to send reaction:', error);
      throw error;
    }
  }

  async getGroupMembers(groupId: string): Promise<MemberInfo[]> {
    try {
      const phoneNumbers = await this.signalCli.getGroupMembers(groupId);
      const members: MemberInfo[] = [];

      for (const phone of phoneNumbers) {
        const member = await prisma.member.findUnique({
          where: { phoneNumber: phone },
        });

        if (member) {
          members.push({
            phoneNumber: member.phoneNumber,
            displayName: member.displayName || undefined,
            role: member.role as 'admin' | 'moderator' | 'member',
            isActive: member.isActive,
            isBanned: member.isBanned,
            isMuted: member.isMuted,
            muteExpiresAt: member.muteExpiresAt || undefined,
            joinedAt: member.joinedAt,
            lastSeenAt: member.lastSeenAt,
          });
        } else {
          members.push({
            phoneNumber: phone,
            role: 'member',
            isActive: true,
            isBanned: false,
            isMuted: false,
            joinedAt: new Date(),
            lastSeenAt: new Date(),
          });
        }
      }

      return members;
    } catch (error) {
      logger.error('Failed to get group members:', error);
      return [];
    }
  }

  async kickMember(groupId: string, phoneNumber: string): Promise<boolean> {
    // Note: Actual Signal group member removal requires signal-cli admin permissions
    logger.warn('kickMember not fully implemented - requires Signal group admin');
    return false;
  }

  async banMember(phoneNumber: string, groupId?: string): Promise<boolean> {
    try {
      await prisma.member.upsert({
        where: { phoneNumber },
        update: { isBanned: true },
        create: { phoneNumber, isBanned: true },
      });
      return true;
    } catch {
      return false;
    }
  }

  async muteMember(phoneNumber: string, duration?: number, groupId?: string): Promise<boolean> {
    try {
      const muteExpiresAt = duration ? new Date(Date.now() + duration * 60 * 1000) : null;
      await prisma.member.upsert({
        where: { phoneNumber },
        update: { isMuted: true, muteExpiresAt },
        create: { phoneNumber, isMuted: true, muteExpiresAt },
      });
      return true;
    } catch {
      return false;
    }
  }

  async unmuteMember(phoneNumber: string, groupId?: string): Promise<boolean> {
    try {
      await prisma.member.update({
        where: { phoneNumber },
        data: { isMuted: false, muteExpiresAt: null },
      });
      return true;
    } catch {
      return false;
    }
  }
}

// Main entry point
async function main(): Promise<void> {
  const bot = new TalonBotService();

  // Handle shutdown signals
  const shutdown = async () => {
    logger.info('Received shutdown signal');
    await bot.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start the bot
  try {
    await bot.start();
  } catch (error) {
    logger.error('Failed to start TalonBOT:', error);
    process.exit(1);
  }
}

// Run
main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});

export { TalonBotService };
export default TalonBotService;
