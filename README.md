# BUMBA Ecosystem

Modular primitives and systems extracted from the BUMBA AI Framework for reusable, composable AI-powered development.

## Architecture

```
bumba-ecosystem/
├── primitives/          # Zero-dependency, single-purpose modules
│   ├── token-optimizer/     # Token usage optimization
│   ├── file-locking/        # File conflict prevention
│   ├── shell-security/      # Safe shell command execution
│   ├── environment-detector/# Environment detection (Claude/Terminal/CI)
│   ├── config-manager/      # Configuration with scopes
│   ├── task-preparer/       # Task preparation and planning
│   ├── adaptive-planner/    # Complexity-based planning
│   ├── rate-limiter/        # Token bucket rate limiting
│   ├── token-cost-manager/  # Cost tracking and budgets
│   ├── context-window/      # Context window management
│   ├── model-comparison/    # Multi-model comparison
│   ├── health-monitor/      # Provider health monitoring
│   └── status-line/         # Terminal status display
│
├── systems/             # Higher-level composed systems
│   ├── orchestration/       # Multi-agent orchestration
│   ├── ai-gateway/          # Unified AI provider gateway
│   ├── memory/              # Persistent agent memory
│   ├── observability/       # Logging and tracing
│   ├── mcp/                 # MCP protocol integration
│   ├── coordination/        # Sprint and task coordination
│   ├── wizard/              # Setup and onboarding
│   └── design-catalog/      # Component catalog system
│
└── shared/              # Shared utilities and types
```

## Installation

```bash
# Install the entire ecosystem
npm install

# Or install individual primitives
cd primitives/token-optimizer && npm install
```

## Primitives

### Token Optimizer
Intelligent token usage optimization for LLM conversations.

```javascript
const { TokenOptimizer } = require('@bumba/token-optimizer');

const optimizer = new TokenOptimizer();
const result = optimizer.optimizeMessages(messages, 'gpt-4o');
console.log(`Saved ${result.tokensSaved} tokens`);
```

### Rate Limiter
Token bucket rate limiting with request queuing.

```javascript
const { RateLimiter } = require('@bumba/rate-limiter');

const limiter = new RateLimiter();
await limiter.initialize();

const check = await limiter.checkLimit('openai', 'gpt-4o');
if (check.allowed) {
  await limiter.consume('openai', 'gpt-4o');
}
```

### File Locking
Prevents file conflicts during parallel agent execution.

```javascript
const { FileLockingSystem } = require('@bumba/file-locking');

const locker = new FileLockingSystem();
const token = await locker.acquireLock('/path/to/file', 'agent-1');
// ... work with file ...
await locker.releaseLock('/path/to/file', token);
```

### Environment Detector
Detects if running in Claude Code, Terminal, or CI/CD.

```javascript
const { getEnvironmentDetector } = require('@bumba/environment-detector');

const detector = getEnvironmentDetector();
const env = detector.detect();

if (env.type === 'claude') {
  // Running in Claude Code
} else if (env.type === 'terminal') {
  // Running in terminal
}
```

### Context Window Manager
Manages context window truncation with multiple strategies.

```javascript
const { ContextWindowManager } = require('@bumba/context-window');

const manager = new ContextWindowManager();
const result = manager.truncate(messages, 'gpt-4o', {
  strategy: 'smart',
  outputTokens: 4096
});
```

### Token Cost Manager
Track spending, set budgets, and get alerts.

```javascript
const { TokenCostManager } = require('@bumba/token-cost-manager');

const manager = new TokenCostManager({
  budget: { dailyLimit: 10, monthlyLimit: 100 }
});

manager.on('budget:alert', (data) => {
  console.warn(`Budget ${data.period} at ${data.percentage}%`);
});

manager.recordUsage('openai', 'gpt-4o', {
  inputTokens: 1000,
  outputTokens: 500
});
```

### Health Monitor
Monitor AI provider health and collect metrics.

```javascript
const { HealthMonitor, HealthStatus } = require('@bumba/health-monitor');

const monitor = new HealthMonitor();
monitor.registerProvider('openai', { url: 'https://api.openai.com/v1/health' });

monitor.on('alert:fired', (alert) => {
  console.error(`Alert: ${alert.name} - ${alert.severity}`);
});

const health = monitor.getSystemHealth();
```

## Design Principles

1. **Zero Dependencies**: Primitives have no external runtime dependencies
2. **Single Purpose**: Each primitive does one thing well
3. **Event-Driven**: All modules extend EventEmitter for observability
4. **Composable**: Systems compose primitives, don't replace them
5. **Framework Agnostic**: Works with any AI provider or framework

## Higher-Level Systems

### Orchestration
Multi-agent task orchestration with pipelines and workflows.

```javascript
const { TaskOrchestrator, PipelineManager, WorkflowEngine } = require('@bumba/orchestration');

const orchestrator = new TaskOrchestrator();
orchestrator.registerAgent('research-agent', { capabilities: ['search', 'analyze'] });

const taskId = await orchestrator.addTask({
  type: 'research',
  description: 'Research AI models',
  priority: 'high'
});
```

### AI Gateway
Unified interface to multiple AI providers with fallback and cost tracking.

```javascript
const { AIGateway } = require('@bumba/ai-gateway');

const gateway = new AIGateway({
  defaultProvider: 'anthropic',
  budget: { monthly: 100 }
});

gateway.registerProvider('anthropic', { apiKey: process.env.ANTHROPIC_API_KEY });

const response = await gateway.chat({
  model: 'claude-sonnet-4-5-20250929',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

### Memory System
Persistent agent memory with semantic search and optimization.

```javascript
const { UnifiedMemory, MemoryOptimizationEngine } = require('@bumba/memory');

const memory = new UnifiedMemory();
await memory.initialize();

await memory.store({
  type: 'knowledge',
  content: 'BUMBA is a multi-agent AI framework',
  tags: ['architecture', 'ai']
});

const results = await memory.search('multi-agent', { limit: 5 });
```

### Observability
Distributed tracing, metrics, and A/B testing for AI systems.

```javascript
const { AgentObservability, TraceRecorder, CompareEngine } = require('@bumba/observability');

const observability = new AgentObservability();
await observability.initialize();

const trace = observability.startTrace('task-execution');
trace.span('api-call');
// ... work ...
trace.end();
```

### MCP Management
Model Context Protocol server lifecycle management.

```javascript
const { MCPManager, MCPServer } = require('@bumba/mcp');

const manager = new MCPManager({ autoRestart: true });
await manager.discover();

manager.register('filesystem', {
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem']
});

await manager.start('filesystem');
```

### Coordination
Department-based agent coordination with collaboration protocols.

```javascript
const { CoordinationFramework, CollaborationMode } = require('@bumba/coordination');

const framework = new CoordinationFramework();

framework.registerDepartment('engineering', {
  agents: ['code-writer', 'reviewer'],
  protocols: ['coding-standards']
});

await framework.coordinate('engineering', {
  task: 'Implement feature',
  mode: CollaborationMode.PARALLEL
});
```

### Setup Wizard
Interactive setup wizard for configuration and API key management.

```javascript
const { SetupWizard, ConfigDetector, MCPConfigGenerator } = require('@bumba/wizard');

const wizard = new SetupWizard();

wizard.on('step:complete', (step) => {
  console.log(`Completed: ${step.name}`);
});

const result = await wizard.run();
```

### Design Catalog
Design token extraction, validation, export, and catalog generation.

```javascript
const { DesignBridge, TokenValidator, ExportEngine, CatalogGenerator } = require('@bumba/design-catalog');

const bridge = new DesignBridge();
await bridge.initialize();

const tokens = await bridge.extractTokens({
  fileId: 'figma-file-id',
  token: process.env.FIGMA_TOKEN
});

const validation = await bridge.validateTokens(tokens, 'wcag-aa');

const exporter = new ExportEngine();
await exporter.exportForWeb(tokens);
```

## License

MIT
