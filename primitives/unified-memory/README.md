# @bumba/unified-memory

Unified memory system for AI agents with SQLite persistence and semantic search.

## Installation

```bash
npm install @bumba/unified-memory
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { UnifiedMemorySystem } = require('@bumba/unified-memory');

const memory = new UnifiedMemorySystem({
  dbPath: './memory.db',
  maxSize: 10000
});

await memory.initialize();

// Store a memory
await memory.storeInMemory('conversation-1', {
  role: 'user',
  content: 'Explain async/await',
  timestamp: Date.now()
});

// Retrieve memories
const results = await memory.searchMemory('async', ['javascript']);
```

## Features

- **SQLite Persistence**: Durable memory storage
- **Semantic Search**: Find related memories
- **TTL Support**: Auto-expire old memories
- **Tagging**: Organize memories with tags

## API

### `UnifiedMemorySystem`

```javascript
const memory = new UnifiedMemorySystem(options);
```

**Options:**
- `dbPath` (string): SQLite database path
- `maxSize` (number): Maximum entries
- `ttl` (number): Time-to-live in ms

**Methods:**
- `initialize()`: Initialize the system
- `storeInMemory(key, data, options)`: Store data
- `retrieveFromMemory(key)`: Retrieve by key
- `searchMemory(query, tags)`: Search memories
- `shutdown()`: Close connections

## Dependencies

- `@bumba/shared` - Shared utilities

## License

MIT
