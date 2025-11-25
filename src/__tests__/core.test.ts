/**
 * Core Plugin Tests
 */

import { CorePlugin } from '../plugins/core';
import { CommandContext, TalonBot } from '../types';

describe('CorePlugin', () => {
  let plugin: CorePlugin;
  let mockBot: jest.Mocked<TalonBot>;
  let mockContext: CommandContext;

  beforeEach(() => {
    mockBot = {
      config: {
        phoneNumber: '+1234567890',
        prefix: '!',
        adminUsers: ['+1111111111'],
        storeMessages: true,
        maxMessagesPerMinute: 10,
        signalCliMode: 'daemon',
        debug: false,
      },
      sendMessage: jest.fn(),
      sendReaction: jest.fn(),
      getGroupMembers: jest.fn(),
      kickMember: jest.fn(),
      banMember: jest.fn(),
      muteMember: jest.fn(),
      unmuteMember: jest.fn(),
    } as jest.Mocked<TalonBot>;

    mockContext = {
      sender: '+1111111111',
      senderName: 'Test User',
      groupId: 'test-group-id',
      groupName: 'Test Group',
      message: '!help',
      command: 'help',
      args: '',
      timestamp: Date.now(),
      bot: mockBot,
      isAdmin: true,
      isModerator: false,
    };

    plugin = new CorePlugin();
    plugin.setBot(mockBot);
  });

  describe('initialization', () => {
    it('should have correct name', () => {
      expect(plugin.name).toBe('core');
    });

    it('should have correct version', () => {
      expect(plugin.version).toBe('1.0.0');
    });

    it('should register help command', () => {
      expect(plugin.hasCommand('help')).toBe(true);
    });

    it('should register ping command', () => {
      expect(plugin.hasCommand('ping')).toBe(true);
    });

    it('should register info command', () => {
      expect(plugin.hasCommand('info')).toBe(true);
    });

    it('should register whoami command', () => {
      expect(plugin.hasCommand('whoami')).toBe(true);
    });

    it('should register command aliases', () => {
      expect(plugin.hasCommand('h')).toBe(true); // help alias
      expect(plugin.hasCommand('p')).toBe(true); // ping alias
    });
  });

  describe('help command', () => {
    it('should return help text', async () => {
      mockContext.command = 'help';
      const result = await plugin.executeCommand(mockContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('TalonBOT Commands');
      expect(result.message).toContain('!help');
      expect(result.message).toContain('!ping');
    });
  });

  describe('ping command', () => {
    it('should return pong with latency', async () => {
      mockContext.command = 'ping';
      mockContext.timestamp = Date.now() - 100; // 100ms ago
      
      const result = await plugin.executeCommand(mockContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Pong!');
      expect(result.message).toContain('Latency');
    });
  });

  describe('info command', () => {
    it('should return bot info', async () => {
      mockContext.command = 'info';
      
      const result = await plugin.executeCommand(mockContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('TalonBOT');
      expect(result.message).toContain('Version');
      expect(result.message).toContain('Online');
    });
  });

  describe('whoami command', () => {
    it('should return user info', async () => {
      mockContext.command = 'whoami';
      
      const result = await plugin.executeCommand(mockContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Your Info');
      expect(result.message).toContain(mockContext.sender);
      expect(result.message).toContain('Admin'); // isAdmin is true
    });

    it('should show moderator role', async () => {
      mockContext.command = 'whoami';
      mockContext.isAdmin = false;
      mockContext.isModerator = true;
      
      const result = await plugin.executeCommand(mockContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Moderator');
    });

    it('should show member role', async () => {
      mockContext.command = 'whoami';
      mockContext.isAdmin = false;
      mockContext.isModerator = false;
      
      const result = await plugin.executeCommand(mockContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Member');
    });
  });

  describe('status command', () => {
    it('should return bot status', async () => {
      mockContext.command = 'status';
      
      const result = await plugin.executeCommand(mockContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Bot Status');
      expect(result.message).toContain('Connected');
    });
  });
});
