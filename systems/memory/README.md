# @bumba/memory

Unified memory system for AI agents with SQLite persistence, semantic search, and context management.

**Comparable to:** LangChain Memory, Mem0

## Installation

```bash
npm install @bumba/memory
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { BumbaMemorySystem } = require('@bumba/memory');

const memory = new BumbaMemorySystem({
  dbPath: './data/memory.db'
});

await memory.initialize();

// Store agent memories
await memory.store('agent-1:task-1', {
  type: 'task_result',
  content: 'Completed code review',
  tags: ['code-review', 'backend']
});

// Search memories
const results = await memory.search('code review');
```

## Features

- **SQLite Persistence**: Durable memory storage
- **Semantic Search**: Find related memories
- **Agent Isolation**: Per-agent memory spaces
- **TTL Support**: Auto-expire old memories
- **Optimization**: Memory compaction and cleanup

## Architecture

```
memory/
├── index.js                      # Main entry
├── sqlite-storage-adapter.js     # SQLite backend
├── memory-optimization-engine.js # Optimization
├── advanced-cache-manager.js     # Caching layer
├── resilience-memory.js          # Failure handling
└── team-memory.js                # Multi-agent memory
```

## API

### `BumbaMemorySystem`

```javascript
const memory = new BumbaMemorySystem(options);
```

**Options:**
- `dbPath` (string): SQLite database path
- `maxSize` (number): Maximum entries
- `ttl` (number): Default TTL in ms

**Methods:**
- `initialize()`: Initialize the system
- `store(key, data, options)`: Store memory
- `retrieve(key)`: Retrieve by key
- `search(query, options)`: Search memories
- `shutdown()`: Clean shutdown

### Factory Function

```javascript
const { createMemorySystem } = require('@bumba/memory');

const memory = createMemorySystem({ maxSize: 10000 });
```

## Dependencies

- `@bumba/shared` - Shared utilities

## Optional Integrations

- `@bumba/unified-memory` primitive for standalone use

## License

MIT
