# @bumba/file-locking

Conflict-free file operations for multi-agent systems. Prevents race conditions when multiple processes access the same files.

## Installation

```bash
npm install @bumba/file-locking
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { FileLockingSystem } = require('@bumba/file-locking');

const locker = new FileLockingSystem();

// Acquire exclusive lock before file operations
const lock = await locker.acquireLock('/path/to/file.json');
try {
  // Safe to read/write file
  await fs.writeFile('/path/to/file.json', data);
} finally {
  await locker.releaseLock(lock);
}
```

## Features

- **Exclusive Locks**: Prevent concurrent writes
- **Shared Locks**: Allow concurrent reads
- **Timeout Handling**: Auto-release stale locks
- **Deadlock Prevention**: Automatic detection and resolution

## API

### `FileLockingSystem`

```javascript
const locker = new FileLockingSystem(options);
```

**Methods:**
- `acquireLock(path, options)`: Acquire a lock on a file
- `releaseLock(lock)`: Release a held lock
- `isLocked(path)`: Check if file is locked

## Dependencies

- `@bumba/shared` - Shared utilities (logger)

## License

MIT
