# @bumba/coordination

Multi-agent coordination framework with territory management, knowledge sharing, and conflict resolution.

**Comparable to:** AutoGen Orchestration, CrewAI

## Installation

```bash
npm install @bumba/coordination
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { UnifiedCoordinationSystem } = require('@bumba/coordination');

const coordination = new UnifiedCoordinationSystem();
await coordination.initialize();

// Register agents
coordination.registerAgent('frontend', {
  capabilities: ['react', 'css']
});
coordination.registerAgent('backend', {
  capabilities: ['node', 'postgres']
});

// Coordinate a task
const assignment = await coordination.assign({
  task: 'Build login page',
  requirements: ['react', 'node']
});
```

## Features

- **Agent Registration**: Register agents with capabilities
- **Task Assignment**: Match tasks to best agents
- **Territory Management**: Prevent file conflicts
- **Knowledge Transfer**: Share context between agents
- **Conflict Resolution**: Handle overlapping work
- **Rotation Scheduling**: Rotate agent assignments

## Architecture

```
coordination/
├── index.js                           # Main export
├── unified-coordination-system.js     # Core system
├── department-protocols.js            # Team protocols
├── agent-identity.js                  # Agent management
├── knowledge-transfer-tracker.js      # Knowledge sharing
├── rotation-scheduler.js              # Scheduling
├── pairing-scheduler.js               # Pair programming
└── collaborative-decision-framework.js # Decision making
```

## API

### `UnifiedCoordinationSystem`

```javascript
const coord = new UnifiedCoordinationSystem(options);
```

**Methods:**
- `initialize()`: Initialize the system
- `registerAgent(id, config)`: Register an agent
- `assign(task)`: Assign a task
- `getAgentStatus(id)`: Get agent status
- `transferKnowledge(from, to, context)`: Transfer knowledge

### Events

```javascript
coord.on('agent:assigned', ({ agent, task }) => {
  console.log(`${agent} assigned to ${task}`);
});

coord.on('conflict:detected', ({ agents, file }) => {
  console.log(`Conflict on ${file}`);
});
```

## Dependencies

- `@bumba/shared` - Shared utilities

## Optional Integrations

- `@bumba/file-locking` - For file conflict prevention
- `@bumba/territory-manager` - For territory management

## License

MIT
