# @bumba/failure-aware

Failure-aware command execution with circuit breaker pattern.

## Installation

```bash
npm install @bumba/failure-aware
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { FailureAwareCommands } = require('@bumba/failure-aware');

const commands = new FailureAwareCommands();

// Execute with circuit breaker protection
const result = await commands.execute('git', ['status'], {
  circuitBreaker: {
    threshold: 5,  // Open after 5 failures
    resetMs: 30000  // Reset after 30 seconds
  }
});
```

## Features

- **Circuit Breaker**: Prevent cascade failures
- **Failure Tracking**: Monitor command reliability
- **Automatic Recovery**: Self-healing circuits
- **Metrics**: Failure rates and recovery times

## API

### `FailureAwareCommands`

```javascript
const commands = new FailureAwareCommands(options);
```

**Methods:**
- `execute(command, args, options)`: Execute with protection
- `getCircuitState(command)`: Get circuit state
- `resetCircuit(command)`: Manually reset circuit

## Dependencies

- `@bumba/shared` - Shared utilities (resilience patterns)

## License

MIT
