# @bumba/process-monitor

Process health monitoring for MCP servers and background tasks.

## Installation

```bash
npm install @bumba/process-monitor
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { ProcessMonitor } = require('@bumba/process-monitor');

const monitor = new ProcessMonitor();

// Monitor a child process
const process = spawn('node', ['server.js']);
monitor.watch(process, {
  restartOnCrash: true,
  maxRestarts: 3
});

monitor.on('crash', (info) => {
  console.log(`Process crashed: ${info.reason}`);
});
```

## Features

- **Crash Detection**: Monitor for unexpected exits
- **Auto-Restart**: Configurable restart policies
- **Resource Monitoring**: CPU and memory tracking
- **Health Checks**: Custom health check functions

## API

### `ProcessMonitor`

```javascript
const monitor = new ProcessMonitor(options);
```

**Methods:**
- `watch(process, options)`: Start monitoring a process
- `unwatch(process)`: Stop monitoring
- `getHealth(process)`: Get process health
- `restart(process)`: Force restart

## Dependencies

- `@bumba/shared` - Shared utilities

## License

MIT
