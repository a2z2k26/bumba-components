# @bumba/token-optimizer

Intelligent token usage optimization for LLM API calls. Reduces costs by 20-40% through smart batching, caching, and prompt compression.

## Installation

```bash
npm install @bumba/token-optimizer
# or as part of the ecosystem
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { TokenOptimizer } = require('@bumba/token-optimizer');

const optimizer = new TokenOptimizer({
  maxTokens: 4096,
  compressionLevel: 'medium'
});

// Optimize a prompt before sending to API
const optimized = optimizer.optimize(longPrompt);
console.log(`Reduced from ${longPrompt.length} to ${optimized.length} chars`);
```

## Features

- **Smart Batching**: Combines multiple small requests
- **Prompt Compression**: Removes redundant content while preserving meaning
- **Token Counting**: Accurate token estimation before API calls
- **Cost Tracking**: Monitor token usage and costs

## API

### `TokenOptimizer`

```javascript
const optimizer = new TokenOptimizer(options);
```

**Options:**
- `maxTokens` (number): Maximum tokens per request
- `compressionLevel` ('low' | 'medium' | 'high'): Compression aggressiveness

**Methods:**
- `optimize(prompt)`: Optimize a prompt string
- `estimateTokens(text)`: Estimate token count
- `getBatchedRequests(prompts)`: Batch multiple prompts

## Dependencies

- `@bumba/shared` - Shared utilities (logger, event patterns)

## License

MIT
