```
██╗     ██╗██╗   ██╗██╗████████╗██╗   ██╗
██║     ██║██║   ██║██║╚══██╔══╝╚██╗ ██╔╝
██║     ██║██║   ██║██║   ██║    ╚████╔╝
██║     ██║╚██╗ ██╔╝██║   ██║     ╚██╔╝
███████╗██║ ╚████╔╝ ██║   ██║      ██║
╚══════╝╚═╝  ╚═══╝  ╚═╝   ╚═╝      ╚═╝
```

# Agent Lifecycle API Documentation

>  **COMPREHENSIVE API REFERENCE** - Complete documentation for the BUMBA Agent Lifecycle Framework

╔══════════════════════════════════════════════════════════════╗
║           Agent Lifecycle - API REFERENCE GUIDE                    ║
║        Building Unified Multi-agent Business Applications     ║
╚══════════════════════════════════════════════════════════════╝

## Table of Contents

- [AgentLifecycle Class](#agentlifecycle-class)
- [AgentOrchestrator Class](#agentorchestrator-class)
- [State Management](#state-management)
- [Event System](#event-system)
- [Configuration Options](#configuration-options)
- [Error Handling](#error-handling)
- [Metrics & Monitoring](#metrics--monitoring)

---

## AgentLifecycle Class

 **Core FSM implementation for managing individual agent lifecycles**

### Constructor

```javascript
new AgentLifecycle(id, config)
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` |  | Unique identifier for the agent |
| `config` | `object` |  | Configuration options (see [Configuration](#configuration-options)) |

#### Example

```javascript
const agent = new AgentLifecycle('worker-001', {
  maxActiveTime: 60000,
  maxRetries: 3,
  metadata: { type: 'processor', priority: 'high' }
});
```

### Methods

####  `transition(event, data)`

Transitions the agent to a new state based on the provided event.

```javascript
await agent.transition(StateEvent.SPAWN, { task: 'process-data' });
```

**Parameters:**
- `event` (StateEvent): The transition event
- `data` (object): Optional context data for the transition

**Returns:** `Promise<void>`

**Throws:** `Error` if transition is invalid from current state

---

####  `getState()`

Returns the current state of the agent.

```javascript
const currentState = agent.getState();
// Returns: 'IDLE' | 'SPAWNING' | 'ACTIVE' | 'VALIDATING' | 'COMPLETING' | 'COMPLETED'
```

**Returns:** `string` - Current state name

---

####  `getStatistics()`

Returns comprehensive runtime statistics for the agent.

```javascript
const stats = agent.getStatistics();
```

**Returns:**
```javascript
{
  id: string,                    // Agent ID
  currentState: string,           // Current state
  totalTransitions: number,       // Total state changes
  stateTime: {                   // Time spent in each state (ms)
    IDLE: number,
    SPAWNING: number,
    ACTIVE: number,
    VALIDATING: number,
    COMPLETING: number,
    COMPLETED: number
  },
  retryCount: number,            // Total retry attempts
  errors: Array<Error>,          // Error history
  createdAt: Date,               // Creation timestamp
  startedAt: Date | null,        // Start timestamp
  completedAt: Date | null,      // Completion timestamp
  metadata: object               // Custom metadata
}
```

---

####  `forceComplete(reason)`

Forces the agent to complete immediately, bypassing normal lifecycle.

```javascript
agent.forceComplete('timeout-exceeded');
```

**Parameters:**
- `reason` (string): Optional reason for forced completion

**Returns:** `void`

---

####  `reset()`

Resets the agent to IDLE state, clearing all statistics.

```javascript
agent.reset();
```

**Returns:** `void`

---

## AgentOrchestrator Class

 **Multi-agent management and coordination system**

### Constructor

```javascript
new AgentOrchestrator(config)
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `config` | `object` |  | Orchestrator configuration |
| `config.maxAgents` | `number` |  | Maximum concurrent agents (default: 100) |
| `config.defaultAgentConfig` | `object` |  | Default config for new agents |

#### Example

```javascript
const orchestrator = new AgentOrchestrator({
  maxAgents: 50,
  defaultAgentConfig: {
    maxActiveTime: 120000,
    maxRetries: 5
  }
});
```

### Methods

####  `createAgent(id, config)`

Creates a new managed agent instance.

```javascript
const agent = orchestrator.createAgent('worker-001', {
  maxActiveTime: 30000
});
```

**Parameters:**
- `id` (string): Unique agent identifier
- `config` (object): Optional agent configuration

**Returns:** `AgentLifecycle` instance

**Throws:** `Error` if max agents reached or ID exists

---

####  `getAgent(id)`

Retrieves an agent by ID.

```javascript
const agent = orchestrator.getAgent('worker-001');
```

**Parameters:**
- `id` (string): Agent identifier

**Returns:** `AgentLifecycle | null`

---

####  `getMetrics()`

Returns system-wide metrics for all managed agents.

```javascript
const metrics = orchestrator.getMetrics();
```

**Returns:**
```javascript
{
  totalAgents: number,           // Total agents created
  activeAgents: number,          // Currently active agents
  idleAgents: number,           // Agents in IDLE state
  completedAgents: number,      // Finished agents
  failedAgents: number,         // Agents with errors
  averageLifetime: number,      // Average agent lifetime (ms)
  totalTransitions: number,     // Total state changes
  errorRate: number,            // Error percentage (0-1)
  uptime: number                // Orchestrator uptime (ms)
}
```

---

####  `getHealth()`

Returns health status and diagnostics.

```javascript
const health = orchestrator.getHealth();
```

**Returns:**
```javascript
{
  status: 'healthy' | 'degraded' | 'unhealthy',
  agents: {
    total: number,
    active: number,
    idle: number,
    completed: number,
    failed: number
  },
  resources: {
    memoryUsage: number,        // Bytes
    cpuUsage: number            // Percentage
  },
  uptime: number,               // Milliseconds
  lastError: Error | null,
  timestamp: Date
}
```

---

####  `completeAll(reason)`

Gracefully completes all active agents.

```javascript
await orchestrator.completeAll('shutdown');
```

**Parameters:**
- `reason` (string): Optional completion reason

**Returns:** `Promise<void>`

---

## State Management

### State Enum

```javascript
const State = {
  IDLE: 'IDLE',
  SPAWNING: 'SPAWNING',
  ACTIVE: 'ACTIVE',
  VALIDATING: 'VALIDATING',
  COMPLETING: 'COMPLETING',
  COMPLETED: 'COMPLETED'
};
```

### StateEvent Enum

```javascript
const StateEvent = {
  SPAWN: 'SPAWN',
  ACTIVATE: 'ACTIVATE',
  VALIDATE: 'VALIDATE',
  COMPLETE: 'COMPLETE'
};
```

### State Transition Rules

```
╔═══════════════════════════════════════════════════════════════╗
║                   VALID STATE TRANSITIONS                      ║
╠═══════════════════════════════════════════════════════════════╣
║  Current State  →  Event  →  Next State                        ║
╠═══════════════════════════════════════════════════════════════╣
║   IDLE        →  SPAWN     →   SPAWNING                   ║
║   SPAWNING    →  ACTIVATE  →   ACTIVE                     ║
║   ACTIVE      →  VALIDATE  →   VALIDATING                 ║
║   VALIDATING  →  COMPLETE  →   COMPLETING                 ║
║   COMPLETING  →  (auto)    →   COMPLETED                  ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## Event System

### AgentLifecycle Events

| Event | Description | Payload |
|-------|-------------|---------|
| `stateChange` | Any state transition | `{ from, to, event, data, timestamp }` |
| `enter:IDLE` | Entered IDLE state | `{ state, data, timestamp }` |
| `enter:SPAWNING` | Entered SPAWNING state | `{ state, data, timestamp }` |
| `enter:ACTIVE` | Entered ACTIVE state | `{ state, data, timestamp }` |
| `enter:VALIDATING` | Entered VALIDATING state | `{ state, data, timestamp }` |
| `enter:COMPLETING` | Entered COMPLETING state | `{ state, data, timestamp }` |
| `enter:COMPLETED` | Entered COMPLETED state | `{ state, data, timestamp }` |
| `exit:[STATE]` | Exited any state | `{ state, data, timestamp }` |
| `lifecycle:started` | Agent started (first transition) | `{ id, timestamp }` |
| `lifecycle:ended` | Agent completed | `{ id, reason, timestamp }` |
| `error` | Error occurred | `{ error, state, context }` |
| `timeout` | State timeout exceeded | `{ state, duration, limit }` |
| `retry` | Retry attempted | `{ attempt, maxRetries, error }` |

### AgentOrchestrator Events

| Event | Description | Payload |
|-------|-------------|---------|
| `agent:created` | New agent created | `{ agentId, config }` |
| `agent:stateChange` | Agent state changed | `{ agentId, from, to, event }` |
| `agent:completed` | Agent completed | `{ agentId, reason }` |
| `agent:error` | Agent error | `{ agentId, error }` |
| `orchestrator:full` | Max agents reached | `{ maxAgents, current }` |
| `orchestrator:healthy` | Health status changed | `{ status, metrics }` |

### Event Usage Examples

```javascript
//  Listen for state changes
agent.on('stateChange', ({ from, to, event, data }) => {
  console.log(`Transition: ${from} -> ${to} via ${event}`);
});

//  Monitor specific state entry
agent.on('enter:ACTIVE', ({ state, data }) => {
  console.log(`Agent is now active with data:`, data);
});

//  Handle errors
agent.on('error', ({ error, state, context }) => {
  console.error(`Error in state ${state}:`, error.message);
});

//  Track lifecycle
agent.on('lifecycle:ended', ({ id, reason }) => {
  console.log(`Agent ${id} completed: ${reason}`);
});

//  Orchestrator monitoring
orchestrator.on('agent:stateChange', ({ agentId, from, to }) => {
  console.log(`[${agentId}] ${from} -> ${to}`);
});
```

---

## Configuration Options

### AgentLifecycle Configuration

```javascript
{
  // Timeout Configuration
  maxIdleTime: 300000,        // Max time in IDLE (ms) - default: 5 min
  maxActiveTime: 1800000,      // Max time in ACTIVE (ms) - default: 30 min
  maxValidationTime: 60000,    // Max time in VALIDATING (ms) - default: 1 min

  // Retry Configuration
  maxRetries: 3,               // Max retry attempts - default: 3
  retryDelay: 1000,           // Initial retry delay (ms) - default: 1000
  retryMultiplier: 2,         // Exponential backoff multiplier - default: 2
  maxRetryDelay: 30000,       // Max retry delay (ms) - default: 30000

  // Behavior Configuration
  autoComplete: true,          // Auto-complete on timeout - default: true
  strictTransitions: true,    // Enforce transition rules - default: true

  // Metadata
  metadata: {                  // Custom metadata object
    type: 'processor',
    priority: 'high',
    owner: 'team-alpha'
  }
}
```

### AgentOrchestrator Configuration

```javascript
{
  // Resource Limits
  maxAgents: 100,              // Maximum concurrent agents - default: 100
  maxMemory: 1073741824,       // Max memory usage (bytes) - default: 1GB

  // Default Agent Configuration
  defaultAgentConfig: {        // Applied to all new agents
    maxActiveTime: 60000,
    maxRetries: 5
  },

  // Monitoring
  healthCheckInterval: 30000,  // Health check interval (ms) - default: 30s
  metricsInterval: 10000,      // Metrics collection interval (ms) - default: 10s

  // Cleanup
  cleanupInterval: 60000,      // Cleanup completed agents (ms) - default: 1 min
  retentionTime: 3600000       // Keep completed agents for (ms) - default: 1 hour
}
```

---

## Error Handling

### Error Types

```javascript
class StateTransitionError extends Error {
  constructor(from, to, event) {
    super(`Invalid transition: ${from} -> ${to} via ${event}`);
    this.from = from;
    this.to = to;
    this.event = event;
  }
}

class TimeoutError extends Error {
  constructor(state, duration) {
    super(`Timeout in state ${state} after ${duration}ms`);
    this.state = state;
    this.duration = duration;
  }
}

class ResourceError extends Error {
  constructor(resource, limit, current) {
    super(`Resource limit exceeded: ${resource} (${current}/${limit})`);
    this.resource = resource;
    this.limit = limit;
    this.current = current;
  }
}
```

### Error Handling Patterns

```javascript
//  Handle transition errors
try {
  await agent.transition(StateEvent.ACTIVATE);
} catch (error) {
  if (error instanceof StateTransitionError) {
    console.error(`Invalid transition from ${error.from}`);
  }
}

//  Handle timeout errors
agent.on('timeout', ({ state, duration, limit }) => {
  console.warn(`State ${state} timed out after ${duration}ms (limit: ${limit}ms)`);
  agent.forceComplete('timeout');
});

//  Handle orchestrator resource errors
orchestrator.on('orchestrator:full', ({ maxAgents, current }) => {
  console.error(`Cannot create agent: limit reached (${current}/${maxAgents})`);
});

//  Global error handler
process.on('unhandledRejection', (error) => {
  if (error instanceof TimeoutError) {
    console.error(`Unhandled timeout in ${error.state}`);
  }
});
```

---

## Metrics & Monitoring

### Metrics Collection

```javascript
//  Agent-level metrics
const agentMetrics = agent.getStatistics();
console.log(`Agent ${agentMetrics.id} metrics:`, {
  transitions: agentMetrics.totalTransitions,
  activeTime: agentMetrics.stateTime.ACTIVE,
  errors: agentMetrics.errors.length
});

//  System-level metrics
const systemMetrics = orchestrator.getMetrics();
console.log('System metrics:', {
  agents: `${systemMetrics.activeAgents}/${systemMetrics.totalAgents}`,
  errorRate: `${(systemMetrics.errorRate * 100).toFixed(2)}%`,
  uptime: `${Math.floor(systemMetrics.uptime / 1000)}s`
});
```

### Health Monitoring

```javascript
//  Health check endpoint
app.get('/health', async (req, res) => {
  const health = orchestrator.getHealth();

  const statusCode = {
    healthy: 200,
    degraded: 503,
    unhealthy: 503
  }[health.status];

  res.status(statusCode).json({
    status: health.status,
    agents: health.agents,
    uptime: health.uptime,
    timestamp: health.timestamp
  });
});

//  Prometheus metrics
app.get('/metrics', (req, res) => {
  const metrics = orchestrator.getMetrics();

  res.type('text/plain');
  res.send(`
# HELP bumba_agents_total Total number of agents
# TYPE bumba_agents_total gauge
bumba_agents_total ${metrics.totalAgents}

# HELP bumba_agents_active Active agents
# TYPE bumba_agents_active gauge
bumba_agents_active ${metrics.activeAgents}

# HELP bumba_error_rate Agent error rate
# TYPE bumba_error_rate gauge
bumba_error_rate ${metrics.errorRate}

# HELP bumba_transitions_total Total state transitions
# TYPE bumba_transitions_total counter
bumba_transitions_total ${metrics.totalTransitions}
  `);
});
```

### Performance Monitoring

```javascript
//  Measure transition performance
const startTime = Date.now();

await agent.transition(StateEvent.SPAWN);
const spawnTime = Date.now() - startTime;

await agent.transition(StateEvent.ACTIVATE);
const activateTime = Date.now() - startTime - spawnTime;

console.log('Performance metrics:', {
  spawn: `${spawnTime}ms`,
  activate: `${activateTime}ms`,
  total: `${Date.now() - startTime}ms`
});
```

---

╔══════════════════════════════════════════════════════════════╗
║                     BUMBA PLATFORM                        ║
║        Building Unified Multi-agent Business Applications     ║
╠══════════════════════════════════════════════════════════════╣
║   ProductStrategist •  BackendEngineer                   ║
║   DesignEngineer •  Testing •  Complete                ║
╚══════════════════════════════════════════════════════════════╝

**Agent Lifecycle API Documentation v1.0** • Professional Framework Team

---