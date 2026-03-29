# @bumba/health-monitor

API health monitoring with latency tracking and alerting.

## Installation

```bash
npm install @bumba/health-monitor
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { HealthMonitor } = require('@bumba/health-monitor');

const monitor = new HealthMonitor({
  endpoints: [
    { name: 'anthropic', url: 'https://api.anthropic.com/health' },
    { name: 'openai', url: 'https://api.openai.com/health' }
  ],
  interval: 60000  // Check every minute
});

monitor.start();

monitor.on('unhealthy', (endpoint) => {
  console.log(`${endpoint.name} is down!`);
});
```

## Features

- **Endpoint Monitoring**: Track multiple APIs
- **Latency Tracking**: P50, P95, P99 metrics
- **Alert System**: Configurable thresholds
- **Health History**: Track uptime over time

## API

### `HealthMonitor`

```javascript
const monitor = new HealthMonitor(options);
```

**Methods:**
- `start()`: Start monitoring
- `stop()`: Stop monitoring
- `getHealth(endpoint)`: Get endpoint health
- `getLatency(endpoint)`: Get latency metrics

## Dependencies

- `@bumba/shared` - Shared utilities (events)

## License

MIT
