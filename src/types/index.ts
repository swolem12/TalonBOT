/**
 * TalonBOT Type Definitions
 */

// Signal Message Types
export interface SignalMessage {
  envelope: SignalEnvelope;
  account: string;
}

export interface SignalEnvelope {
  source: string;
  sourceNumber?: string;
  sourceUuid?: string;
  sourceName?: string;
  sourceDevice: number;
  timestamp: number;
  dataMessage?: SignalDataMessage;
  syncMessage?: SignalSyncMessage;
  receiptMessage?: SignalReceiptMessage;
  typingMessage?: SignalTypingMessage;
}

export interface SignalDataMessage {
  timestamp: number;
  message?: string;
  expiresInSeconds?: number;
  viewOnce?: boolean;
  groupInfo?: SignalGroupInfo;
  attachments?: SignalAttachment[];
  mentions?: SignalMention[];
  quote?: SignalQuote;
  reaction?: SignalReaction;
}

export interface SignalGroupInfo {
  groupId: string;
  type?: string;
  name?: string;
}

export interface SignalAttachment {
  contentType: string;
  filename?: string;
  id: string;
  size: number;
}

export interface SignalMention {
  start: number;
  length: number;
  uuid: string;
  number?: string;
}

export interface SignalQuote {
  id: number;
  author: string;
  authorNumber?: string;
  text?: string;
  attachments?: SignalAttachment[];
  mentions?: SignalMention[];
}

export interface SignalReaction {
  emoji: string;
  targetAuthor: string;
  targetAuthorNumber?: string;
  targetSentTimestamp: number;
  isRemove?: boolean;
}

export interface SignalSyncMessage {
  sentMessage?: SignalSentMessage;
  readMessages?: SignalReadMessage[];
}

export interface SignalSentMessage {
  destination?: string;
  destinationNumber?: string;
  timestamp: number;
  message?: string;
  expiresInSeconds?: number;
  viewOnce?: boolean;
  groupInfo?: SignalGroupInfo;
}

export interface SignalReadMessage {
  sender: string;
  senderNumber?: string;
  timestamp: number;
}

export interface SignalReceiptMessage {
  when: number;
  isDelivery?: boolean;
  isRead?: boolean;
  timestamps: number[];
}

export interface SignalTypingMessage {
  action: 'STARTED' | 'STOPPED';
  timestamp: number;
  groupId?: string;
}

// Bot Command Types
export interface CommandContext {
  sender: string;
  senderName?: string;
  groupId?: string;
  groupName?: string;
  message: string;
  command: string;
  args: string;
  timestamp: number;
  bot: TalonBot;
  isAdmin: boolean;
  isModerator: boolean;
}

export interface CommandResult {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

export interface Command {
  name: string;
  description: string;
  usage: string;
  aliases?: string[];
  adminOnly?: boolean;
  moderatorOnly?: boolean;
  groupOnly?: boolean;
  dmOnly?: boolean;
  execute: (context: CommandContext) => Promise<CommandResult>;
}

// Plugin Types
export interface Plugin {
  name: string;
  description: string;
  version: string;
  commands: Map<string, Command>;
  enabled: boolean;
  initialize?: () => Promise<void>;
  shutdown?: () => Promise<void>;
}

// Bot Configuration Types
export interface BotConfig {
  phoneNumber: string;
  prefix: string;
  adminUsers: string[];
  masterAdmin?: string;
  storeMessages: boolean;
  maxMessagesPerMinute: number;
  signalCliMode: 'daemon' | 'jsonrpc' | 'cli';
  signalCliPath?: string;
  signalCliDataDir?: string;
  signalCliJsonRpcUrl?: string;
  debug: boolean;
}

// Report Types
export interface ReportOptions {
  groupId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  keywords?: string[];
  limit?: number;
}

export interface ReportResult {
  type: string;
  groupId?: string;
  groupName?: string;
  messageCount: number;
  uniqueUsers: number;
  topUsers?: UserActivity[];
  keywords?: KeywordCount[];
  content: string;
  generatedAt: Date;
}

export interface UserActivity {
  phoneNumber: string;
  displayName?: string;
  messageCount: number;
  lastActive: Date;
}

export interface KeywordCount {
  keyword: string;
  count: number;
}

// Member Management Types
export interface MemberInfo {
  phoneNumber: string;
  displayName?: string;
  role: 'admin' | 'moderator' | 'member';
  isActive: boolean;
  isBanned: boolean;
  isMuted: boolean;
  muteExpiresAt?: Date;
  joinedAt: Date;
  lastSeenAt: Date;
  messageCount?: number;
}

export interface MemberAction {
  action: 'kick' | 'ban' | 'mute' | 'unmute' | 'promote' | 'demote';
  targetPhoneNumber: string;
  adminPhoneNumber: string;
  groupId?: string;
  reason?: string;
  duration?: number; // For mute, in minutes
}

// TalonBot Interface (for type safety)
export interface TalonBot {
  config: BotConfig;
  sendMessage: (recipient: string, message: string, groupId?: string) => Promise<void>;
  sendReaction: (recipient: string, emoji: string, targetTimestamp: number, groupId?: string) => Promise<void>;
  getGroupMembers: (groupId: string) => Promise<MemberInfo[]>;
  kickMember: (groupId: string, phoneNumber: string) => Promise<boolean>;
  banMember: (phoneNumber: string, groupId?: string) => Promise<boolean>;
  muteMember: (phoneNumber: string, duration?: number, groupId?: string) => Promise<boolean>;
  unmuteMember: (phoneNumber: string, groupId?: string) => Promise<boolean>;
}
