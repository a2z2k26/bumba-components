# @bumba/territory-manager

File territory management for multi-agent systems. Prevents conflicts by assigning file ownership.

## Installation

```bash
npm install @bumba/territory-manager
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { TerritoryManager } = require('@bumba/territory-manager');

const territory = new TerritoryManager();

// Claim ownership of a file
await territory.claim('agent-1', '/src/auth/*.js');

// Check before modifying
if (await territory.canModify('agent-2', '/src/auth/login.js')) {
  // Safe to modify
} else {
  const owner = territory.getOwner('/src/auth/login.js');
  console.log(`File owned by ${owner}`);
}
```

## Features

- **Glob Pattern Claims**: Claim file patterns
- **Conflict Detection**: Prevent overlapping claims
- **Ownership Transfer**: Hand off territories
- **Expiration**: Auto-release stale claims

## API

### `TerritoryManager`

```javascript
const territory = new TerritoryManager(options);
```

**Methods:**
- `claim(agentId, pattern)`: Claim territory
- `release(agentId, pattern)`: Release territory
- `canModify(agentId, path)`: Check modification rights
- `getOwner(path)`: Get file owner

## Dependencies

- `@bumba/shared` - Shared utilities
- `@bumba/file-locking` (optional) - For file locking integration

## License

MIT
