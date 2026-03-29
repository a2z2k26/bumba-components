# @bumba/error-recovery

Intelligent error recovery for MCP servers with automatic retry and fallback.

## Installation

```bash
npm install @bumba/error-recovery
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { ErrorRecovery } = require('@bumba/error-recovery');

const recovery = new ErrorRecovery({
  maxRetries: 3,
  backoffMs: 1000
});

// Wrap operations with automatic recovery
const result = await recovery.withRecovery(async () => {
  return await riskyOperation();
}, {
  fallback: () => defaultValue
});
```

## Features

- **Automatic Retry**: Exponential backoff
- **Fallback Handlers**: Graceful degradation
- **Error Classification**: Retry vs fail fast
- **Recovery Hooks**: Custom recovery logic

## API

### `ErrorRecovery`

```javascript
const recovery = new ErrorRecovery(options);
```

**Methods:**
- `withRecovery(fn, options)`: Wrap operation with recovery
- `classify(error)`: Classify error type
- `shouldRetry(error)`: Check if should retry

## Dependencies

- `@bumba/shared` - Shared utilities

## License

MIT
