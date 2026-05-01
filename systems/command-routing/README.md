```
███████╗██╗███╗   ███╗██╗██╗   ██╗ █████╗ ██╗  ██╗
██╔════╝██║████╗ ████║██║╚██╗ ██╔╝██╔══██╗██║  ██║
███████╗██║██╔████╔██║██║ ╚████╔╝ ███████║███████║
╚════██║██║██║╚██╔╝██║██║  ╚██╔╝  ██╔══██║██╔══██║
███████║██║██║ ╚═╝ ██║██║   ██║   ██║  ██║██║  ██║
╚══════╝╚═╝╚═╝     ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝
```

# Command Routing

╔══════════════════════════════════════════════════════════════════╗
║ 🟢 **Command Router** • Part of the BUMBA Platform               ║
║ Building Unified Multi-agent Business Applications               ║
╚══════════════════════════════════════════════════════════════════╝

**Professional Command Routing for AI Agent Systems**

Lightweight command routing primitive with pattern-matching, analytics, middleware support, and memory-safe operation.

## 🏁 Installation

```bash
npm install @bumba/command-routing
```

## 🟡 Quick Start

```javascript
const { CommandRouter } = require('@bumba/command-routing');

const router = new CommandRouter({
  maxStatsHistory: 1000,
  timeout: 30000,
  maxRetries: 3
});

// Register handlers
router.registerHandler('build', async (analysis, context) => {
  return { status: 'built', target: analysis.args[0] };
});

// Route commands
const result = await router.route('build', ['api-server']);
```

## Core Features

### 🟢 Command Analysis Engine
**Backend Engineering Excellence**
- **Intent Detection** - Automatic intent classification with confidence scoring
- **Pattern Matching** - Recognizes common development patterns
- **Complexity Estimation** - Evaluates command difficulty (0-1 scale)

### 🟡 Middleware Pipeline
**Strategic Architecture Design**
```javascript
router.use(async (context) => {
  // Authentication, logging, rate limiting
  if (!context.userId) throw new Error('Auth required');
});
```

### 🔴 Event System
**Real-time System Monitoring**
```javascript
router.on('command:completed', (data) => {
  metrics.recordLatency(data.duration);
});

router.on('command:error', (data) => {
  alerting.notify(data.error);
});
```

## API Reference

╔═══════════════════════════════════════════════════════════════════╗
║                      **Core Methods**                             ║
╠═══════════════════════════════════════════════════════════════════╣
║ `route(command, args?, context?)`                                 ║
║ → Route command to appropriate handler                            ║
╟───────────────────────────────────────────────────────────────────╢
║ `registerHandler(intent, handler, options?)`                      ║
║ → Register handler for specific intent                            ║
╟───────────────────────────────────────────────────────────────────╢
║ `use(middleware)`                                                 ║
║ → Add middleware to processing pipeline                           ║
╟───────────────────────────────────────────────────────────────────╢
║ `getStats()`                                                      ║
║ → Retrieve router performance statistics                          ║
╟───────────────────────────────────────────────────────────────────╢
║ `health()`                                                        ║
║ → Get system health check status                                  ║
╟───────────────────────────────────────────────────────────────────╢
║ `cleanup()`                                                       ║
║ → Clear history while preserving statistics                       ║
╚═══════════════════════════════════════════════════════════════════╝

## 🟠 Advanced Features

### Memory Management
**Professional Resource Optimization**
```javascript
// Rolling window prevents memory leaks
const router = new CommandRouter({
  maxStatsHistory: 1000  // Keep last 1000 commands
});

// Periodic cleanup for long-running processes
setInterval(() => router.cleanup(), 3600000);
```

### OpenTelemetry Integration
**Enterprise-Grade Observability**
```javascript
const tracer = trace.getTracer('command-router');
const router = new CommandRouter({ telemetry: tracer });
```

### TypeScript Support
**Type-Safe Development**
```typescript
import { CommandRouter, CommandAnalysis } from '@bumba/command-routing';

router.registerHandler('build', async (analysis: CommandAnalysis) => {
  return { status: 'success' };
});
```

## 🏁 Production Ready

╔══════════════════════════════════════════════════════════════════╗
║                    **Enterprise Features**                       ║
╠══════════════════════════════════════════════════════════════════╣
║ 🟢 **Health Monitoring** - Built-in health checks               ║
║ 🟢 **Memory Safe** - Rolling window statistics                  ║
║ 🟡 **Error Context** - Full retry history                       ║
║ 🟡 **Distributed Tracing** - OpenTelemetry hooks               ║
║ 🔴 **TypeScript** - Full type definitions                       ║
║ 🟠 **90%+ Test Coverage** - Comprehensive test suite            ║
╚══════════════════════════════════════════════════════════════════╝

---

## BUMBA Platform Integration

**Command Routing** seamlessly integrates with the BUMBA ecosystem:

🟡 **CHATTA** - Voice interaction layer
🟢 **KUMBUKA** - Memory and context management
🔴 **JIBU** - Response generation
🟠 **AKILI** - Intelligence layer

---

## License

MIT © BUMBA Platform

---

<div align="center">

**Building Unified Multi-agent Business Applications**

*Professional • Intelligent • Secure*

</div>