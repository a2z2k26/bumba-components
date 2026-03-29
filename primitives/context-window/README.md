# @bumba/context-window

Smart context window management for LLM conversations with automatic pruning.

## Installation

```bash
npm install @bumba/context-window
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { ContextWindowManager } = require('@bumba/context-window');

const context = new ContextWindowManager({
  maxTokens: 100000,
  reserveTokens: 4000  // Reserve for response
});

// Add messages
context.addMessage({ role: 'user', content: 'Hello' });
context.addMessage({ role: 'assistant', content: 'Hi there!' });

// Get optimized context for API call
const optimized = context.getOptimizedContext();
```

## Features

- **Automatic Pruning**: Remove old messages when needed
- **Priority-Based Retention**: Keep important messages
- **Token Estimation**: Accurate context size tracking
- **Sliding Window**: Configurable retention strategies

## API

### `ContextWindowManager`

```javascript
const context = new ContextWindowManager(options);
```

**Methods:**
- `addMessage(message)`: Add a message to context
- `getOptimizedContext()`: Get pruned context
- `getTokenCount()`: Get current token count
- `clear()`: Clear all context

## Dependencies

- `@bumba/shared` - Shared utilities

## License

MIT
