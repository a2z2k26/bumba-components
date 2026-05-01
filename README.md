# BUMBA Ecosystem

Modular primitives and systems for AI-powered development. A toolkit of focused, composable Node.js modules covering the day-to-day infrastructure needs of multi-agent AI applications: rate limiting, token accounting, file locking, memory, orchestration, observability, MCP integration, and more.

## Quick start

```bash
# Clone and install the workspace
git clone https://github.com/a2z2k26/bumba-features.git
cd bumba-features
npm install
```

Each primitive and system is its own npm workspace package. Use them individually or compose them into larger applications.

## Architecture

```
bumba-ecosystem/
├── primitives/    # Zero-/light-dependency, single-purpose modules
├── systems/       # Higher-level composed systems
└── shared/        # Common utilities (logger, events, resilience, types)
```

## Status

This is an early public release of internal tooling. Maturity varies across the workspace:

- All 20 primitives and all 11 systems load and expose their documented APIs.
- Three systems (`agent-lifecycle`, `command-routing`, `tool-bridge`) ship with examples and tests.
- The remaining packages currently have READMEs but no examples or test suites yet — contributions welcome.

If you adopt a package and find a rough edge, open an issue and we'll prioritize.

## Primitives

20 focused modules. Each does one thing well and has its own README.

| Package | Purpose |
|---|---|
| [`adaptive-planner`](primitives/adaptive-planner) | Complexity-based task planning |
| [`agent-factory`](primitives/agent-factory) | Agent instantiation patterns |
| [`config-manager`](primitives/config-manager) | Configuration with scopes (env / file / runtime) |
| [`context-window`](primitives/context-window) | LLM context-window truncation strategies |
| [`environment-detector`](primitives/environment-detector) | Detect Claude Code / Terminal / CI runtime |
| [`error-recovery`](primitives/error-recovery) | Retry, fallback, and recovery strategies |
| [`failure-aware`](primitives/failure-aware) | Failure-aware execution wrappers |
| [`file-locking`](primitives/file-locking) | File conflict prevention for parallel agents |
| [`health-monitor`](primitives/health-monitor) | AI provider health checks and alerts |
| [`model-comparison`](primitives/model-comparison) | Multi-model output comparison |
| [`model-supervisor`](primitives/model-supervisor) | Model supervision and routing |
| [`process-monitor`](primitives/process-monitor) | Process lifecycle monitoring |
| [`rate-limiter`](primitives/rate-limiter) | Token-bucket rate limiting with queuing |
| [`shell-security`](primitives/shell-security) | Safe shell command execution |
| [`status-line`](primitives/status-line) | Terminal status display |
| [`task-preparer`](primitives/task-preparer) | Task preparation and planning helpers |
| [`territory-manager`](primitives/territory-manager) | Resource territory allocation |
| [`token-cost-manager`](primitives/token-cost-manager) | Token cost tracking and budgets |
| [`token-optimizer`](primitives/token-optimizer) | Token usage optimization for LLM messages |
| [`unified-memory`](primitives/unified-memory) | Unified memory primitives |

## Systems

11 higher-level systems composed from primitives. Each has its own README; `agent-lifecycle`, `command-routing`, and `tool-bridge` also include examples and tests.

| Package | Purpose |
|---|---|
| [`agent-lifecycle`](systems/agent-lifecycle) | Lightweight FSM for agent lifecycles with timeouts and cleanup |
| [`ai-gateway`](systems/ai-gateway) | Unified AI provider gateway with fallback + cost tracking |
| [`command-routing`](systems/command-routing) | Pattern-matching command router with middleware support |
| [`coordination`](systems/coordination) | Department-based agent coordination protocols |
| [`design-catalog`](systems/design-catalog) | Design token extraction, validation, and catalog generation |
| [`mcp`](systems/mcp) | Model Context Protocol server lifecycle management |
| [`memory`](systems/memory) | Persistent agent memory with semantic search |
| [`observability`](systems/observability) | Distributed tracing, metrics, and A/B comparison |
| [`orchestration`](systems/orchestration) | Multi-agent task orchestration, pipelines, and workflows |
| [`tool-bridge`](systems/tool-bridge) | Universal AI development gateway |
| [`wizard`](systems/wizard) | Interactive setup and onboarding |

## Highlights

A few representative examples to give you a feel. See each package's README for full APIs.

### Token Optimizer

```js
const { TokenOptimizer } = require('@bumba/token-optimizer');

const optimizer = new TokenOptimizer();
const result = optimizer.optimizeMessages(messages, 'gpt-4o');
console.log(`Saved ${result.tokensSaved} tokens`);
```

### Rate Limiter

```js
const { RateLimiter } = require('@bumba/rate-limiter');

const limiter = new RateLimiter();
await limiter.initialize();

const check = await limiter.checkLimit('openai', 'gpt-4o');
if (check.allowed) {
  await limiter.consume('openai', 'gpt-4o');
}
```

### File Locking

```js
const { FileLockingSystem } = require('@bumba/file-locking');

const locker = new FileLockingSystem();
const token = await locker.acquireLock('/path/to/file', 'agent-1');
// ... work with file ...
await locker.releaseLock('/path/to/file', token);
```

### AI Gateway

```js
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

### Orchestration

```js
const { TaskOrchestrator } = require('@bumba/orchestration');

const orchestrator = new TaskOrchestrator();
orchestrator.registerAgent('research-agent', { capabilities: ['search', 'analyze'] });

const taskId = await orchestrator.addTask({
  type: 'research',
  description: 'Research AI models',
  priority: 'high'
});
```

## Design principles

1. **Single purpose** — Each primitive does one thing well.
2. **Composable** — Systems compose primitives; they don't replace them.
3. **Event-driven** — Modules extend `EventEmitter` for observability.
4. **Framework agnostic** — Works with any AI provider or framework.
5. **Light dependencies** — Primitives keep external dependencies minimal; systems may depend on `@bumba/shared`.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for our community standards.

## License

[MIT](LICENSE)
