/**
 * TypeScript Type Definitions for BUMBA Setup Wizard
 */

export interface APIKeys {
  openai?: string;
  anthropic?: string;
  google?: string;
  openrouter?: string;
  github?: string;
  notion?: string;
  pinecone?: string;
  deepseek?: string;
  qwen?: string;
  kimi?: string;
}

export interface MCPServer {
  enabled: boolean;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPServers {
  filesystem?: MCPServer;
  memory?: MCPServer;
  github?: MCPServer;
  notion?: MCPServer;
  fetch?: MCPServer;
  serena?: MCPServer;
  semgrep?: MCPServer;
  brave?: MCPServer;
}

export interface BridgeConfig {
  enabled: boolean;
  port: number;
  host: string;
  sessionToken?: string;
  rateLimitPerMinute: number;
  cacheEnabled: boolean;
  cacheTTL: number;
}

export interface BumbaSettings {
  defaultModel: string;
  enableDynamicSwitching: boolean;
  maxSpecialists: number;
  tokenLimit: number;
  telemetry: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface SecuritySettings {
  encryptKeys: boolean;
  auditLogging: boolean;
  backupOnChange: boolean;
}

export interface Metadata {
  version: string;
  lastUpdated: string;
  setupCompleted: boolean;
}

export interface BumbaConfiguration {
  environment: 'development' | 'staging' | 'production';
  apiKeys: APIKeys;
  mcpServers: MCPServers;
  bridge: BridgeConfig;
  bumba: BumbaSettings;
  security: SecuritySettings;
  metadata: Metadata;
}

export interface SetupStep {
  id: string;
  name: string;
  description: string;
  required: boolean;
  completed: boolean;
  execute: () => Promise<void>;
}

export interface SetupStatus {
  hasAPIKeys: boolean;
  hasMCPServers: boolean;
  hasBridge: boolean;
  isComplete: boolean;
  missingComponents: string[];
}