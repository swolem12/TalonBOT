/**
 * TalonBOT Base Plugin
 * 
 * Base class for all bot plugins
 */

import { Command, CommandContext, CommandResult, Plugin } from '../types';
import logger from '../lib/logger';
import prisma from '../lib/prisma';

export abstract class BaseCommand implements Command {
  name: string;
  description: string;
  usage: string;
  aliases: string[];
  adminOnly: boolean;
  moderatorOnly: boolean;
  groupOnly: boolean;
  dmOnly: boolean;

  constructor(
    name: string,
    description: string,
    usage: string,
    options: Partial<{
      aliases: string[];
      adminOnly: boolean;
      moderatorOnly: boolean;
      groupOnly: boolean;
      dmOnly: boolean;
    }> = {}
  ) {
    this.name = name;
    this.description = description;
    this.usage = usage;
    this.aliases = options.aliases || [];
    this.adminOnly = options.adminOnly || false;
    this.moderatorOnly = options.moderatorOnly || false;
    this.groupOnly = options.groupOnly || false;
    this.dmOnly = options.dmOnly || false;
  }

  /**
   * Check if command can be executed
   */
  canExecute(context: CommandContext): { allowed: boolean; reason?: string } {
    // Check admin requirement
    if (this.adminOnly && !context.isAdmin) {
      return { allowed: false, reason: 'This command requires admin privileges.' };
    }

    // Check moderator requirement
    if (this.moderatorOnly && !context.isAdmin && !context.isModerator) {
      return { allowed: false, reason: 'This command requires moderator privileges.' };
    }

    // Check group-only requirement
    if (this.groupOnly && !context.groupId) {
      return { allowed: false, reason: 'This command can only be used in group chats.' };
    }

    // Check DM-only requirement
    if (this.dmOnly && context.groupId) {
      return { allowed: false, reason: 'This command can only be used in direct messages.' };
    }

    return { allowed: true };
  }

  abstract execute(context: CommandContext): Promise<CommandResult>;
}

export abstract class BasePlugin implements Plugin {
  name: string;
  description: string;
  version: string;
  commands: Map<string, Command>;
  enabled: boolean;
  protected bot: CommandContext['bot'] | null = null;

  constructor(name: string, description: string, version: string = '1.0.0') {
    this.name = name;
    this.description = description;
    this.version = version;
    this.commands = new Map();
    this.enabled = true;
  }

  /**
   * Initialize plugin (called when bot starts)
   */
  async initialize(): Promise<void> {
    logger.info(`Initializing plugin: ${this.name} v${this.version}`);
  }

  /**
   * Shutdown plugin (called when bot stops)
   */
  async shutdown(): Promise<void> {
    logger.info(`Shutting down plugin: ${this.name}`);
  }

  /**
   * Set bot reference
   */
  setBot(bot: CommandContext['bot']): void {
    this.bot = bot;
  }

  /**
   * Register a command
   */
  registerCommand(command: Command): void {
    this.commands.set(command.name, command);
    
    // Register aliases
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.commands.set(alias, command);
      }
    }

    logger.debug(`Registered command: ${command.name}`);
  }

  /**
   * Check if plugin handles a command
   */
  hasCommand(commandName: string): boolean {
    return this.commands.has(commandName);
  }

  /**
   * Execute a command
   */
  async executeCommand(context: CommandContext): Promise<CommandResult> {
    const command = this.commands.get(context.command);

    if (!command) {
      return { success: false, message: 'Command not found' };
    }

    // Check permissions
    const permission = (command as BaseCommand).canExecute?.(context) || { allowed: true };
    if (!permission.allowed) {
      return { success: false, message: permission.reason };
    }

    // Track command usage
    try {
      const startTime = Date.now();
      const result = await command.execute(context);
      const responseTime = Date.now() - startTime;

      // Log command usage
      await prisma.commandUsage.create({
        data: {
          command: context.command,
          args: context.args || null,
          groupId: context.groupId || null,
          groupName: context.groupName || null,
          userId: context.sender,
          userName: context.senderName || null,
          success: result.success,
          responseTime,
          errorMessage: result.success ? null : result.message,
        },
      });

      return result;
    } catch (error) {
      logger.error(`Error executing command ${context.command}:`, error);
      
      // Log error
      await prisma.commandUsage.create({
        data: {
          command: context.command,
          args: context.args || null,
          groupId: context.groupId || null,
          groupName: context.groupName || null,
          userId: context.sender,
          userName: context.senderName || null,
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      return { success: false, message: 'An error occurred while executing the command.' };
    }
  }

  /**
   * Get help text for all commands
   */
  getHelpText(): string {
    const lines: string[] = [`📦 ${this.name} (v${this.version})`, this.description, ''];

    const uniqueCommands = new Map<string, Command>();
    for (const [name, command] of this.commands) {
      if (!uniqueCommands.has(command.name)) {
        uniqueCommands.set(command.name, command);
      }
    }

    for (const command of uniqueCommands.values()) {
      let line = `• ${command.name} - ${command.description}`;
      if (command.aliases && command.aliases.length > 0) {
        line += ` (aliases: ${command.aliases.join(', ')})`;
      }
      lines.push(line);
    }

    return lines.join('\n');
  }

  // Helper methods for plugins
  protected log(level: 'info' | 'debug' | 'warn' | 'error', message: string, ...args: unknown[]): void {
    const prefix = `[${this.name}]`;
    switch (level) {
      case 'info':
        logger.info(`${prefix} ${message}`, ...args);
        break;
      case 'debug':
        logger.debug(`${prefix} ${message}`, ...args);
        break;
      case 'warn':
        logger.warn(`${prefix} ${message}`, ...args);
        break;
      case 'error':
        logger.error(`${prefix} ${message}`, ...args);
        break;
    }
  }

  protected async sendMessage(
    recipient: string,
    message: string,
    groupId?: string
  ): Promise<void> {
    if (this.bot) {
      await this.bot.sendMessage(recipient, message, groupId);
    }
  }

  protected async sendReaction(
    recipient: string,
    emoji: string,
    targetTimestamp: number,
    groupId?: string
  ): Promise<void> {
    if (this.bot) {
      await this.bot.sendReaction(recipient, emoji, targetTimestamp, groupId);
    }
  }
}

export default BasePlugin;
