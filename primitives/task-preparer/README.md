# @bumba/task-preparer

Prepare and structure tasks for AI agent execution with context gathering.

## Installation

```bash
npm install @bumba/task-preparer
```

## Quick Start

```javascript
const { TaskPreparer } = require('@bumba/task-preparer');

const preparer = new TaskPreparer();

const prepared = preparer.prepare({
  task: 'Fix the login bug',
  context: {
    files: ['src/auth/login.js'],
    issue: 'Users getting 500 error'
  }
});

// Send prepared task to agent
await agent.execute(prepared);
```

## Features

- **Context Gathering**: Collect relevant context
- **Task Structuring**: Standardized task format
- **Priority Assignment**: Automatic prioritization
- **Dependency Detection**: Find related tasks

## API

### `TaskPreparer`

```javascript
const preparer = new TaskPreparer(options);
```

**Methods:**
- `prepare(task)`: Prepare a task
- `addContext(task, context)`: Add context to task
- `getPriority(task)`: Calculate task priority

## Zero Dependencies

This primitive has no external dependencies beyond Node.js built-ins.

## License

MIT
