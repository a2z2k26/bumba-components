/**
 * Command Routing TypeScript Definitions
 * Command Router for the Agent Primitives
 * @module @bumba/command-routing
 */

/// <reference types="node" />
import { EventEmitter } from 'events';

export interface CommandAnalysis {
  command: string;
  args: string[];
  fullCommand: string;
  intent: string;
  patterns: PatternMatch[];
  complexity: number;
  confidence: number;
}

export interface PatternMatch {
  name: string;
  regex: RegExp;
  priority: 'high' | 'medium' | 'low';
}

export interface HandlerOptions {
  priority?: 'high' | 'normal' | 'low';
  timeout?: number;
  retries?: number;
  middleware?: MiddlewareFunction[];
}

export interface CommandContext {
  commandId: string;
  analysis: CommandAnalysis;
  [key: string]: any;
}

export interface CommandResult {
  success: boolean;
  commandId: string;
  analysis?: CommandAnalysis;
  result?: any;
  error?: string;
  duration: number;
}

export interface RouterConfig {
  enableAnalytics?: boolean;
  enableMiddleware?: boolean;
  defaultHandler?: string;
  timeout?: number;
  maxRetries?: number;
  maxStatsHistory?: number;
  telemetry?: any; // OpenTelemetry tracer instance
}

export interface RouterStats {
  totalCommands: number;
  successfulCommands: number;
  failedCommands: number;
  averageResponseTime: number;
  commandsByIntent: Record<string, number>;
  handlerStats: Record<string, any>;
  successRate?: number;
  registeredHandlers?: string[];
  middlewareCount?: number;
}

export type HandlerFunction = (
  analysis: CommandAnalysis,
  context: CommandContext
) => Promise<any>;

export type MiddlewareFunction = (context: CommandContext) => Promise<void>;

export declare class CommandAnalyzer {
  analyzeCommand(command: string, args?: string[], context?: any): CommandAnalysis;
  detectIntent(command: string): string;
  matchPatterns(command: string): PatternMatch[];
  calculateComplexity(command: string): number;
  calculateConfidence(command: string): number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  handlers: number;
  middleware: number;
  uptime: number;
  memory: {
    historySize: number;
    maxHistory: number;
  };
  stats: {
    total: number;
    success: number;
    failed: number;
    successRate: number;
    recentFailureRate: number;
    averageResponseTime: number;
  };
}

export interface Diagnostics extends HealthStatus {
  configuration: RouterConfig;
  handlers: Array<{
    intent: string;
    priority: string;
    timeout: number;
    retries: number;
    hasMiddleware: boolean;
  }>;
  recentErrors: Array<{
    timestamp: string;
    intent: string;
    duration: number;
  }>;
  intentDistribution: Record<string, number>;
}

export interface TelemetryHooks {
  onCommandStart?: (name: string, attributes: Record<string, any>) => any;
  onCommandEnd?: (span: any, options: { status?: string }) => void;
  onHandlerStart?: (name: string, attributes: Record<string, any>) => any;
  onHandlerEnd?: (span: any, options: { status?: string }) => void;
  onMiddlewareStart?: (name: string, attributes: Record<string, any>) => any;
  onMiddlewareEnd?: (span: any, options: { status?: string }) => void;
  onError?: (span: any, error: Error) => void;
}

export declare class CommandRouter extends EventEmitter {
  constructor(options?: RouterConfig);

  // Core methods
  route(command: string, args?: string[], context?: any): Promise<CommandResult>;
  registerHandler(intent: string, handler: HandlerFunction, options?: HandlerOptions): this;
  unregisterHandler(intent: string): boolean;
  use(middleware: MiddlewareFunction): this;

  // Stats and management
  getStats(): RouterStats;
  reset(): void;
  listHandlers(): Array<{
    intent: string;
    priority: string;
    timeout: number;
    retries: number;
    hasMiddleware: boolean;
  }>;

  // Health and diagnostics
  health(): HealthStatus;
  diagnostics(): Diagnostics;

  // Telemetry
  setTelemetryHooks(hooks: TelemetryHooks): this;

  // Cleanup methods
  cleanup(): { clearedCommands: number };
  destroy(): void;

  // Events
  on(event: 'handler:registered', listener: (data: { intent: string; options: HandlerOptions }) => void): this;
  on(event: 'handler:unregistered', listener: (data: { intent: string }) => void): this;
  on(event: 'command:received', listener: (data: { commandId: string; analysis: CommandAnalysis; timestamp: string }) => void): this;
  on(event: 'command:completed', listener: (data: { commandId: string; analysis: CommandAnalysis; result: any; duration: number }) => void): this;
  on(event: 'command:error', listener: (data: { commandId: string; command: string; args: string[]; error: string; duration: number }) => void): this;
  on(event: 'middleware:error', listener: (data: { error: string; context: CommandContext }) => void): this;
  on(event: 'stats:reset', listener: () => void): this;
  on(event: 'cleanup:completed', listener: (data: { clearedCommands: number; timestamp: string }) => void): this;
  on(event: 'router:destroyed', listener: () => void): this;
}

export declare function createRouter(options?: RouterConfig): CommandRouter;

export declare const Intent: {
  readonly BUILD: 'build';
  readonly ANALYZE: 'analyze';
  readonly FIX: 'fix';
  readonly OPTIMIZE: 'optimize';
  readonly TEST: 'test';
  readonly DEPLOY: 'deploy';
  readonly DOCUMENT: 'document';
  readonly GENERAL: 'general';
};

/**
 * Command Routing version and metadata
 */
export declare const Command Routing: {
  readonly version: string;
  readonly platform: 'BUMBA';
  readonly name: 'Command Routing';
};