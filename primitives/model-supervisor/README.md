# @bumba/model-supervisor

Claude API supervision with automatic retry, fallback, and health monitoring.

## Installation

```bash
npm install @bumba/model-supervisor
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { ClaudeSupervisor } = require('@bumba/model-supervisor');

const supervisor = new ClaudeSupervisor({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 3,
  fallbackModel: 'claude-3-haiku'
});

// Supervised API call with automatic retry
const response = await supervisor.complete({
  model: 'claude-3-opus',
  prompt: 'Explain quantum computing'
});
```

## Features

- **Automatic Retry**: Exponential backoff on failures
- **Model Fallback**: Switch to backup model on errors
- **Health Monitoring**: Track API health and latency
- **Rate Limit Handling**: Respect API limits

## API

### `ClaudeSupervisor`

```javascript
const supervisor = new ClaudeSupervisor(options);
```

**Options:**
- `apiKey` (string): Anthropic API key
- `maxRetries` (number): Maximum retry attempts
- `fallbackModel` (string): Fallback model on failure

**Methods:**
- `complete(options)`: Make a supervised API call
- `getHealth()`: Get API health status

## Dependencies

- `@bumba/shared` - Shared utilities

## License

MIT
