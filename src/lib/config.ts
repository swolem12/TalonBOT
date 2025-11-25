/**
 * TalonBOT Configuration
 */

import dotenv from 'dotenv';
import { BotConfig } from '../types';

// Load environment variables
dotenv.config();

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseStringArray(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

export function loadConfig(): BotConfig {
  const phoneNumber = process.env.SIGNAL_BOT_PHONE_NUMBER;
  
  if (!phoneNumber) {
    throw new Error('SIGNAL_BOT_PHONE_NUMBER environment variable is required');
  }

  return {
    phoneNumber,
    prefix: process.env.BOT_PREFIX || '!',
    adminUsers: parseStringArray(process.env.ADMIN_USERS),
    masterAdmin: process.env.MASTER_ADMIN,
    storeMessages: parseBoolean(process.env.STORE_MESSAGES, true),
    maxMessagesPerMinute: parseNumber(process.env.MAX_MESSAGES_PER_MINUTE, 10),
    signalCliMode: (process.env.SIGNAL_CLI_MODE as BotConfig['signalCliMode']) || 'daemon',
    signalCliPath: process.env.SIGNAL_CLI_PATH,
    signalCliDataDir: process.env.SIGNAL_CLI_DATA_DIR,
    signalCliJsonRpcUrl: process.env.SIGNAL_CLI_JSON_RPC_URL || 'http://localhost:7583',
    debug: parseBoolean(process.env.DEBUG, false),
  };
}

export const config = loadConfig();
