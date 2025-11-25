/**
 * TalonBOT Signal CLI Service
 * 
 * Handles communication with signal-cli daemon or JSON-RPC
 */

import { spawn, ChildProcess } from 'child_process';
import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import logger from './logger';
import { BotConfig, SignalMessage, SignalDataMessage, SignalGroupInfo } from '../types';

export interface SendMessageOptions {
  recipient?: string;
  groupId?: string;
  message: string;
  attachments?: string[];
  mentions?: Array<{ start: number; length: number; uuid: string }>;
}

export class SignalCliService extends EventEmitter {
  private config: BotConfig;
  private process: ChildProcess | null = null;
  private jsonRpcClient: AxiosInstance | null = null;
  private isRunning = false;
  private messageBuffer = '';

  constructor(config: BotConfig) {
    super();
    this.config = config;
  }

  /**
   * Start the Signal CLI service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Signal CLI service is already running');
      return;
    }

    logger.info(`Starting Signal CLI service in ${this.config.signalCliMode} mode...`);

    if (this.config.signalCliMode === 'jsonrpc') {
      await this.startJsonRpcMode();
    } else {
      await this.startDaemonMode();
    }

    this.isRunning = true;
    logger.info('Signal CLI service started successfully');
  }

  /**
   * Stop the Signal CLI service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping Signal CLI service...');

    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }

    this.isRunning = false;
    logger.info('Signal CLI service stopped');
  }

  /**
   * Start in JSON-RPC mode (connects to existing signal-cli-rest-api)
   */
  private async startJsonRpcMode(): Promise<void> {
    const url = this.config.signalCliJsonRpcUrl || 'http://localhost:7583';
    
    this.jsonRpcClient = axios.create({
      baseURL: url,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Test connection
    try {
      await this.jsonRpcClient.get('/v1/about');
      logger.info(`Connected to Signal CLI JSON-RPC at ${url}`);
    } catch (error) {
      throw new Error(`Failed to connect to Signal CLI JSON-RPC at ${url}: ${error}`);
    }

    // Start polling for messages
    this.startMessagePolling();
  }

  /**
   * Start in daemon mode (spawns signal-cli process)
   */
  private async startDaemonMode(): Promise<void> {
    const signalCliPath = this.config.signalCliPath || 'signal-cli';
    const args = [
      '-a', this.config.phoneNumber,
      'daemon',
      '--json',
    ];

    if (this.config.signalCliDataDir) {
      args.unshift('--config', this.config.signalCliDataDir);
    }

    logger.debug(`Spawning: ${signalCliPath} ${args.join(' ')}`);

    this.process = spawn(signalCliPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleDaemonOutput(data.toString());
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      logger.error(`Signal CLI stderr: ${data.toString()}`);
    });

    this.process.on('error', (error) => {
      logger.error('Signal CLI process error:', error);
      this.emit('error', error);
    });

    this.process.on('exit', (code) => {
      logger.info(`Signal CLI process exited with code ${code}`);
      this.isRunning = false;
      this.emit('exit', code);
    });
  }

  /**
   * Handle output from daemon mode
   */
  private handleDaemonOutput(data: string): void {
    this.messageBuffer += data;
    
    // Process complete JSON lines
    const lines = this.messageBuffer.split('\n');
    this.messageBuffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line) as SignalMessage;
          this.processMessage(message);
        } catch {
          logger.debug(`Non-JSON output: ${line}`);
        }
      }
    }
  }

  /**
   * Start polling for messages in JSON-RPC mode
   */
  private startMessagePolling(): void {
    const pollInterval = 1000; // 1 second
    
    const poll = async () => {
      if (!this.isRunning || !this.jsonRpcClient) return;

      try {
        const response = await this.jsonRpcClient.get(
          `/v1/receive/${encodeURIComponent(this.config.phoneNumber)}`
        );
        
        const messages = response.data as SignalMessage[];
        for (const message of messages) {
          this.processMessage(message);
        }
      } catch (error) {
        logger.debug('No messages or polling error:', error);
      }

      setTimeout(poll, pollInterval);
    };

    poll();
  }

  /**
   * Process incoming message
   */
  private processMessage(message: SignalMessage): void {
    const envelope = message.envelope;
    
    if (!envelope) return;

    // Handle data messages (regular messages)
    if (envelope.dataMessage) {
      this.emit('message', {
        source: envelope.source || envelope.sourceNumber,
        sourceName: envelope.sourceName,
        sourceUuid: envelope.sourceUuid,
        timestamp: envelope.timestamp,
        dataMessage: envelope.dataMessage,
        groupInfo: envelope.dataMessage.groupInfo,
      });
    }

    // Handle reactions
    if (envelope.dataMessage?.reaction) {
      this.emit('reaction', {
        source: envelope.source || envelope.sourceNumber,
        sourceName: envelope.sourceName,
        timestamp: envelope.timestamp,
        reaction: envelope.dataMessage.reaction,
        groupInfo: envelope.dataMessage.groupInfo,
      });
    }

    // Handle receipts
    if (envelope.receiptMessage) {
      this.emit('receipt', {
        source: envelope.source || envelope.sourceNumber,
        receiptMessage: envelope.receiptMessage,
      });
    }

    // Handle typing indicators
    if (envelope.typingMessage) {
      this.emit('typing', {
        source: envelope.source || envelope.sourceNumber,
        typingMessage: envelope.typingMessage,
      });
    }
  }

  /**
   * Send a message
   */
  async sendMessage(options: SendMessageOptions): Promise<void> {
    const { recipient, groupId, message, attachments, mentions } = options;

    if (!recipient && !groupId) {
      throw new Error('Either recipient or groupId must be specified');
    }

    logger.debug(`Sending message to ${groupId || recipient}: ${message.substring(0, 50)}...`);

    if (this.config.signalCliMode === 'jsonrpc' && this.jsonRpcClient) {
      await this.sendMessageJsonRpc(options);
    } else {
      await this.sendMessageCli(options);
    }
  }

  /**
   * Send message via JSON-RPC
   */
  private async sendMessageJsonRpc(options: SendMessageOptions): Promise<void> {
    const { recipient, groupId, message, attachments } = options;
    
    const endpoint = groupId 
      ? `/v2/send`
      : `/v2/send`;

    const payload: Record<string, unknown> = {
      message,
      number: this.config.phoneNumber,
      recipients: groupId ? undefined : [recipient],
      base64_attachments: attachments,
    };

    if (groupId) {
      payload.recipients = [groupId];
    }

    await this.jsonRpcClient!.post(endpoint, payload);
  }

  /**
   * Send message via CLI
   */
  private async sendMessageCli(options: SendMessageOptions): Promise<void> {
    const { recipient, groupId, message, attachments } = options;
    
    const signalCliPath = this.config.signalCliPath || 'signal-cli';
    const args = ['-a', this.config.phoneNumber];

    if (this.config.signalCliDataDir) {
      args.unshift('--config', this.config.signalCliDataDir);
    }

    args.push('send', '-m', message);

    if (groupId) {
      args.push('-g', groupId);
    } else if (recipient) {
      args.push(recipient);
    }

    if (attachments && attachments.length > 0) {
      args.push('-a', ...attachments);
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(signalCliPath, args);
      let stderr = '';

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`signal-cli exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Send a reaction
   */
  async sendReaction(
    targetAuthor: string,
    targetTimestamp: number,
    emoji: string,
    groupId?: string
  ): Promise<void> {
    logger.debug(`Sending reaction ${emoji} to message from ${targetAuthor}`);

    if (this.config.signalCliMode === 'jsonrpc' && this.jsonRpcClient) {
      await this.jsonRpcClient.post('/v1/reactions', {
        number: this.config.phoneNumber,
        recipient: groupId || targetAuthor,
        reaction: emoji,
        target_author: targetAuthor,
        target_timestamp: targetTimestamp,
      });
    } else {
      const signalCliPath = this.config.signalCliPath || 'signal-cli';
      const args = [
        '-a', this.config.phoneNumber,
        'sendReaction',
        '-e', emoji,
        '-a', targetAuthor,
        '-t', targetTimestamp.toString(),
      ];

      if (groupId) {
        args.push('-g', groupId);
      } else {
        args.push(targetAuthor);
      }

      await this.executeCliCommand(args);
    }
  }

  /**
   * Get group members
   */
  async getGroupMembers(groupId: string): Promise<string[]> {
    if (this.config.signalCliMode === 'jsonrpc' && this.jsonRpcClient) {
      const response = await this.jsonRpcClient.get(
        `/v1/groups/${encodeURIComponent(this.config.phoneNumber)}`
      );
      const groups = response.data as Array<{ id: string; members: string[] }>;
      const group = groups.find((g) => g.id === groupId);
      return group?.members || [];
    } else {
      const signalCliPath = this.config.signalCliPath || 'signal-cli';
      const args = ['-a', this.config.phoneNumber, 'listGroups', '-d', '--output', 'json'];
      
      const output = await this.executeCliCommand(args);
      const groups = JSON.parse(output) as Array<{ id: string; members: Array<{ number: string }> }>;
      const group = groups.find((g) => g.id === groupId);
      return group?.members.map((m) => m.number) || [];
    }
  }

  /**
   * Execute a CLI command and return output
   */
  private executeCliCommand(args: string[]): Promise<string> {
    const signalCliPath = this.config.signalCliPath || 'signal-cli';

    if (this.config.signalCliDataDir) {
      args.unshift('--config', this.config.signalCliDataDir);
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(signalCliPath, args);
      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`signal-cli exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Check if service is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

export default SignalCliService;
