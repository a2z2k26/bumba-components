# @bumba/agent-factory

Create and manage AI agents with configurable behaviors and capabilities.

## Installation

```bash
npm install @bumba/agent-factory
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { AgentFactory } = require('@bumba/agent-factory');

const factory = new AgentFactory();

const agent = factory.create({
  name: 'coder',
  role: 'Software Engineer',
  capabilities: ['code-review', 'debugging', 'documentation']
});

const response = await agent.execute({
  task: 'Review this pull request',
  context: prCode
});
```

## Features

- **Agent Templates**: Pre-built agent archetypes
- **Custom Capabilities**: Define agent skills
- **Memory Integration**: Optional memory persistence
- **Multi-Agent Coordination**: Agent-to-agent communication

## API

### `AgentFactory`

```javascript
const factory = new AgentFactory(options);
```

**Methods:**
- `create(config)`: Create a new agent
- `getAgent(name)`: Retrieve existing agent
- `listAgents()`: List all agents

### `Agent`

**Methods:**
- `execute(task)`: Execute a task
- `addCapability(cap)`: Add a capability
- `getMemory()`: Get agent memory

## Optional Dependencies

- `@bumba/memory` - For agent memory persistence
- `@bumba/ai-gateway` - For multi-provider AI access

## License

MIT
