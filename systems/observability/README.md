# @bumba/observability

Complete observability suite with tracing, metrics, and agent monitoring for AI applications.

**Comparable to:** OpenTelemetry, Datadog APM

## Installation

```bash
npm install @bumba/observability
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { TraceIntegration, AgentObservability } = require('@bumba/observability');

const tracer = new TraceIntegration({ autoSave: true });
const observability = new AgentObservability();

// Start tracing a query
await tracer.initialize('What is the weather?');

// Record steps
tracer.startStep('llm', 'completion');
const response = await llm.complete(query);
tracer.endStep('llm', 'completion', { tokens: response.tokens });

// End trace
await tracer.endTrace({ success: true });
```

## Features

- **Distributed Tracing**: Track requests across agents
- **Metrics Collection**: Token usage, latency, errors
- **Agent Monitoring**: Real-time agent health
- **Trace Recording**: Persistent trace storage
- **Live View**: Real-time execution monitoring

## Architecture

```
observability/
├── index.js                # Agent observability
├── trace-recorder.js       # Trace recording
├── trace-integration.js    # Easy integration
└── trace-viewer.js         # Trace visualization
```

## API

### `TraceIntegration`

```javascript
const tracer = new TraceIntegration(options);
```

**Methods:**
- `initialize(query)`: Start a trace
- `startStep(system, action)`: Begin step timing
- `endStep(system, action, data)`: End step
- `endTrace(result)`: Complete the trace

### `AgentObservability`

```javascript
const obs = new AgentObservability(options);
```

**Methods:**
- `registerAgent(id, config)`: Register agent
- `recordMetric(agent, metric, value)`: Record metric
- `getMetrics(agent)`: Get agent metrics
- `getHealth(agent)`: Get agent health

## Dependencies

- `@bumba/shared` - Shared utilities

## License

MIT
