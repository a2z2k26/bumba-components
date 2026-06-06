/**
 * Agent Lifecycle TypeScript Definitions
 * Part of the Agent Primitives
 */
/// <reference types="node" />
import { EventEmitter } from 'events';

export enum AgentState {
  IDLE = 'idle',
  SPAWNING = 'spawning',
  ACTIVE = 'active',
  VALIDATING = 'validating',
  COMPLETING = 'completing',
  COMPLETED = 'completed'
}

export enum StateEvent {
  SPAWN = 'spawn',
  ACTIVATE = 'activate',
  VALIDATE = 'validate',
  COMPLETE = 'complete',
  ERROR = 'error',
  TIMEOUT = 'timeout',
  RETRY = 'retry'
}

export interface AgentConfig {
  maxIdleTime?: number;
  maxActiveTime?: number;
  maxValidationTime?: number;
  maxRetries?: number;
  autoComplete?: boolean;
  storeHistory?: boolean;
}

export interface StateTransition {
  from: AgentState;
  to: AgentState;
  event: StateEvent;
  timestamp: number;
  data?: any;
}

export interface StateChangeEvent {
  agentId: string;
  from: AgentState;
  to: AgentState;
  event: StateEvent;
  data?: any;
}

export interface AgentStatistics {
  createdAt: number;
  lastStateChange: number;
  totalTransitions: number;
  timeInStates: Record<AgentState, number>;
  errors: Array<{
    timestamp: number;
    state: AgentState;
    error: string;
    stack?: string;
  }>;
  currentState: AgentState;
  totalLifetime: number;
  retryCount: number;
  statePercentages: Record<AgentState, string>;
}

export interface OrchestratorMetrics {
  totalSpawned: number;
  totalCompleted: number;
  activeAgents: number;
  stateDistribution: Record<AgentState, number>;
  totalAgents: number;
  utilization: string;
}

export interface HealthIssue {
  id: string;
  state: AgentState;
  stuckDuration?: number;
  duration?: number;
  lastChange?: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'warning' | 'unhealthy';
  timestamp: string;
  orchestrator: {
    totalAgents: number;
    maxAgents: number;
    utilization: string;
    activeAgents: number;
    totalSpawned: number;
    totalCompleted: number;
  };
  stateDistribution: Record<AgentState, number>;
  issues: {
    stuck: HealthIssue[];
    warnings: HealthIssue[];
  };
  recommendations: string[];
}

export interface OrchestratorConfig {
  maxAgents?: number;
  defaultAgentConfig?: AgentConfig;
  enableMetrics?: boolean;
}

export declare class AgentLifecycle extends EventEmitter {
  constructor(agentId: string, options?: AgentConfig);

  readonly agentId: string;
  readonly currentState: AgentState;
  readonly previousState: AgentState | null;
  readonly stateHistory: StateTransition[];
  readonly metadata: Record<string, any>;
  readonly config: Required<AgentConfig>;
  readonly retryCount: number;

  transition(event: StateEvent, data?: any): Promise<boolean>;
  canTransition(from: AgentState, to: AgentState, data?: any): boolean;
  forceComplete(reason?: string): Promise<void>;
  retry(data?: any): Promise<boolean>;

  getState(): AgentState;
  isInState(state: AgentState): boolean;
  isAvailable(): boolean;
  isCompleted(): boolean;
  canAcceptWork(): boolean;

  getStatistics(): AgentStatistics;
  getHistory(): StateTransition[];
  getMetadata(): Record<string, any>;
  updateMetadata(updates: Record<string, any>): void;
  recordError(error: Error): void;

  cleanup(): void;

  on(event: 'stateChange', listener: (data: StateChangeEvent) => void): this;
  on(event: 'lifecycle:started', listener: (data: { agentId: string; config: Required<AgentConfig> }) => void): this;
  on(event: 'lifecycle:ended', listener: (data: { agentId: string; stats: AgentStatistics }) => void): this;
  on(event: `enter:${AgentState}`, listener: (data: { agentId: string; previousState: AgentState; data?: any }) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;
}

export declare class AgentOrchestrator extends EventEmitter {
  constructor(options?: OrchestratorConfig);

  readonly agents: Map<string, AgentLifecycle>;
  readonly config: Required<OrchestratorConfig>;
  readonly metrics: OrchestratorMetrics;

  createAgent(agentId: string, config?: AgentConfig): AgentLifecycle;
  getAgent(agentId: string): AgentLifecycle | undefined;
  removeAgent(agentId: string): void;

  getAgentsInState(state: AgentState): Array<{
    id: string;
    agent: AgentLifecycle;
    stats: AgentStatistics;
  }>;

  getMetrics(): OrchestratorMetrics;
  getSummary(): {
    totalAgents: number;
    metrics: OrchestratorMetrics;
    agents: Array<{
      id: string;
      state: AgentState;
      stats: AgentStatistics;
    }>;
  };

  completeAll(reason?: string): Promise<void>;
  getHealth(): HealthStatus;

  on(event: 'agent:stateChange', listener: (data: StateChangeEvent) => void): this;
  on(event: 'agent:completed', listener: (data: { agentId: string; stats: AgentStatistics }) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;
}

export function create(agentId: string, options?: AgentConfig): AgentLifecycle;
export function createOrchestrator(options?: OrchestratorConfig): AgentOrchestrator;