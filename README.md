```
██████╗ ██╗   ██╗███╗   ███╗██████╗  █████╗      ██████╗ ██████╗ ███╗   ███╗██████╗  ██████╗ ███╗   ██╗███████╗███╗   ██╗████████╗███████╗
██╔══██╗██║   ██║████╗ ████║██╔══██╗██╔══██╗    ██╔════╝██╔═══██╗████╗ ████║██╔══██╗██╔═══██╗████╗  ██║██╔════╝████╗  ██║╚══██╔══╝██╔════╝
██████╔╝██║   ██║██╔████╔██║██████╔╝███████║    ██║     ██║   ██║██╔████╔██║██████╔╝██║   ██║██╔██╗ ██║█████╗  ██╔██╗ ██║   ██║   ███████╗
██╔══██╗██║   ██║██║╚██╔╝██║██╔══██╗██╔══██║    ██║     ██║   ██║██║╚██╔╝██║██╔═══╝ ██║   ██║██║╚██╗██║██╔══╝  ██║╚██╗██║   ██║   ╚════██║
██████╔╝╚██████╔╝██║ ╚═╝ ██║██████╔╝██║  ██║    ╚██████╗╚██████╔╝██║ ╚═╝ ██║██║     ╚██████╔╝██║ ╚████║███████╗██║ ╚████║   ██║   ███████║
╚═════╝  ╚═════╝ ╚═╝     ╚═╝╚═════╝ ╚═╝  ╚═╝     ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝      ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝
```

<br>

### Extracted primitives and compoennts from BUMBA 1.0, a production grade multi-agent system.

---

### 🔴 What This Is ###

Bumba Components is the open-source artifact from a private, production multi-agent AI system built to orchestrate parallel agent workforces, manage LLM costs at scale, and ship design-to-code pipelines autonomously.

These modules were not designed for release. They were designed to work — under real production load, across multiple AI providers, with multiple agents writing to the same files at the same time. When we extracted them from the larger system, we got something worth sharing: **31 focused packages** that solve the unglamorous infrastructure problems every serious AI application eventually hits.

If you're building anything non-trivial with LLMs — a multi-agent pipeline, an AI gateway, a developer tool, these early experimental primitves and components might be a helpful reference point.

---

### 🟡 Why It Exists ###

Building production AI systems means solving the same problems over and over:

- **Token budgets blow up** — you need real-time tracking, not post-hoc billing surprises
- **Parallel agents corrupt shared files** — you need locking that actually works
- **Provider outages cascade** — you need health monitoring and automatic fallback
- **Rate limits kill throughput** — you need a real token-bucket implementation, not a sleep loop
- **Context windows overflow silently** — you need truncation strategies before the API rejects your request
- **Agent state evaporates** — you need memory that survives process restarts

Bumba Components exists because we needed all of these, and the npm ecosystem didn't have them in a form we trusted.

---

### 🟢 What's Included ###

31 packages split into two tiers. Use any package standalone — or compose them into larger systems the way they're used in Bumba 1.0.

**20 Primitives** — zero-to-light dependency, single-purpose modules.

| Package | Purpose |
|---|---|
| [`adaptive-planner`](primitives/adaptive-planner) | Complexity-based task planning and decomposition |
| [`agent-factory`](primitives/agent-factory) | Agent instantiation patterns and lifecycle bootstrapping |
| [`config-manager`](primitives/config-manager) | Layered configuration (env / file / runtime) with merge semantics |
| [`context-window`](primitives/context-window) | LLM context-window truncation strategies |
| [`environment-detector`](primitives/environment-detector) | Detect Claude Code / Terminal / CI runtime automatically |
| [`error-recovery`](primitives/error-recovery) | Retry, fallback, and circuit-breaker strategies |
| [`failure-aware`](primitives/failure-aware) | Execution wrappers that degrade gracefully under failure |
| [`file-locking`](primitives/file-locking) | File conflict prevention for parallel agents writing shared resources |
| [`health-monitor`](primitives/health-monitor) | AI provider health checks, alerting, and status aggregation |
| [`model-comparison`](primitives/model-comparison) | Side-by-side multi-model output comparison and scoring |
| [`model-supervisor`](primitives/model-supervisor) | Model supervision, routing, and quality gating |
| [`process-monitor`](primitives/process-monitor) | Process lifecycle monitoring and crash recovery |
| [`rate-limiter`](primitives/rate-limiter) | Token-bucket rate limiting with queuing and backpressure |
| [`shell-security`](primitives/shell-security) | Safe shell command execution with injection prevention |
| [`status-line`](primitives/status-line) | Dynamic terminal status display for long-running agent processes |
| [`task-preparer`](primitives/task-preparer) | Task preparation, decomposition, and planning helpers |
| [`territory-manager`](primitives/territory-manager) | Resource territory allocation for parallel agent coordination |
| [`token-cost-manager`](primitives/token-cost-manager) | Real-time token cost tracking with per-provider budgets |
| [`token-optimizer`](primitives/token-optimizer) | Token usage optimization and message compression for LLM calls |
| [`unified-memory`](primitives/unified-memory) | Unified memory primitives with pluggable storage backends |

**11 Systems** — higher-level compositions. Each has its own README; `agent-lifecycle`, `command-routing`, and `tool-bridge` ship with examples and tests.

| Package | Purpose |
|---|---|
| [`agent-lifecycle`](systems/agent-lifecycle) | Lightweight FSM for agent lifecycles with timeouts and cleanup |
| [`ai-gateway`](systems/ai-gateway) | Unified AI provider gateway with automatic fallback and cost tracking |
| [`command-routing`](systems/command-routing) | Pattern-matching command router with middleware support |
| [`coordination`](systems/coordination) | Department-based agent coordination protocols |
| [`design-catalog`](systems/design-catalog) | Design token extraction, validation, and catalog generation |
| [`mcp`](systems/mcp) | Model Context Protocol server lifecycle management |
| [`memory`](systems/memory) | Persistent agent memory with semantic search |
| [`observability`](systems/observability) | Distributed tracing, metrics, and A/B comparison |
| [`orchestration`](systems/orchestration) | Multi-agent task orchestration, pipelines, and workflow execution |
| [`tool-bridge`](systems/tool-bridge) | Universal AI development gateway — connect any model to any tool |
| [`wizard`](systems/wizard) | Interactive setup and configuration onboarding |

---

### 🏁 Quick Start ###

```bash
git clone https://github.com/a2z2k26/bumba-components.git
cd bumba-components
npm install
```

Each package is an independent npm workspace. Install and use individually:

```bash
# Use a single primitive in your own project
npm install @bumba/rate-limiter
npm install @bumba/token-cost-manager
npm install @bumba/file-locking
```

Or clone the workspace and import directly for local development.

---

### 🏁 Examples ###

**Rate limiting across multiple AI providers:**

```js
const { RateLimiter } = require('@bumba/rate-limiter');

const limiter = new RateLimiter();
await limiter.initialize();

const check = await limiter.checkLimit('anthropic', 'claude-sonnet-4-5');
if (check.allowed) {
  await limiter.consume('anthropic', 'claude-sonnet-4-5');
  // make your API call
}
```

**Token cost tracking with monthly budgets:**

```js
const { TokenCostManager } = require('@bumba/token-cost-manager');

const costs = new TokenCostManager({ budget: { monthly: 50 } });
await costs.recordUsage('anthropic', 'claude-opus-4-7', { input: 1200, output: 400 });

const summary = await costs.getSummary();
console.log(`Used $${summary.totalCost.toFixed(4)} of $50 budget`);
```

**File locking for parallel agents:**

```js
const { FileLockingSystem } = require('@bumba/file-locking');

const locker = new FileLockingSystem();
const token = await locker.acquireLock('/shared/output.json', 'agent-3');
// ... agent-3 safely writes ...
await locker.releaseLock('/shared/output.json', token);
```

**Unified AI gateway with fallback:**

```js
const { AIGateway } = require('@bumba/ai-gateway');

const gateway = new AIGateway({ defaultProvider: 'anthropic' });
gateway.registerProvider('anthropic', { apiKey: process.env.ANTHROPIC_API_KEY });
gateway.registerProvider('openai', { apiKey: process.env.OPENAI_API_KEY }); // fallback

const response = await gateway.chat({
  model: 'claude-sonnet-4-5-20250929',
  messages: [{ role: 'user', content: 'Hello' }]
});
```

**Context window management:**

```js
const { ContextWindowManager } = require('@bumba/context-window');

const manager = new ContextWindowManager({ maxTokens: 8192 });
const safe = manager.truncate(messages, { strategy: 'drop-oldest' });
// safe is guaranteed to fit within the context window
```

---

### 🏁 Architecture ###

```
bumba-components/
├── primitives/    # 20 zero-/light-dependency, single-purpose modules
├── systems/       # 11 higher-level systems composed from primitives
├── shared/        # Common utilities: logger, events, resilience, types
└── scripts/       # Workspace tooling: smoke test, package updater
```

**Design principles:**

1. **Single purpose** — each primitive does one thing and does it well
2. **Composable** — systems compose primitives; they don't replace them
3. **Event-driven** — modules extend `EventEmitter` for built-in observability
4. **Framework agnostic** — works with any AI provider, any framework, any runtime
5. **Light dependencies** — primitives minimize external deps; systems may depend on `@bumba/shared`

---

### 🏁 Status ###

This is the first public release of internal production tooling. Maturity varies:

- All 31 packages load and expose their documented APIs ✓
- `agent-lifecycle`, `command-routing`, and `tool-bridge` ship with examples and tests ✓
- The remaining packages have READMEs — example suites and test coverage are in progress

If you adopt a package and hit a rough edge, open an issue. Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

---

### 🏁 Origin ###

Bumba Components was extracted from **Bumba 1.0** — a private multi-agent orchestration platform built for production AI development workflows. These packages represent the infrastructure layer: the modules that had to work before anything else could. They've been in use under real load across parallel agent workforces, multiple AI providers, and continuous autonomous execution.

The extraction was deliberate. This infrastructure is useful on its own — and it's better in the open than locked in a private repo.

---

## License

[MIT](LICENSE)
