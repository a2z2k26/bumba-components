# @bumba/orchestration

Complete workflow automation and task orchestration framework with pipelines, scheduling, and multi-agent coordination.

**Comparable to:** Temporal.io, Apache Airflow, Prefect

## Installation

```bash
npm install @bumba/orchestration
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { WorkflowOrchestrator, PipelineManager } = require('@bumba/orchestration');

const orchestrator = new WorkflowOrchestrator();
await orchestrator.initialize();

// Create a multi-step pipeline
const pipeline = await orchestrator.createPipeline('build-deploy', [
  { id: 'build', agent: 'backend', action: 'compile' },
  { id: 'test', agent: 'qa', action: 'run-tests', dependsOn: ['build'] },
  { id: 'deploy', agent: 'devops', action: 'deploy', dependsOn: ['test'] }
]);

// Execute the pipeline
const result = await orchestrator.executePipeline('build-deploy');
console.log(result.status);  // 'completed'
```

## Features

- **Pipeline Management**: Create and manage multi-step workflows
- **Dependency Tracking**: Automatic dependency resolution
- **Agent Assignment**: Assign tasks to specialized agents
- **Parallel Execution**: Run independent tasks concurrently
- **Scheduling**: Cron-based and event-triggered execution
- **Failure Recovery**: Automatic retry and recovery

## Architecture

```
orchestration/
├── workflow/
│   ├── pipeline-manager.js      # Pipeline lifecycle
│   ├── pipeline-orchestrator.js # Execution engine
│   ├── pipeline-scheduler.js    # Scheduling system
│   └── loop-controller.js       # Iteration control
├── orchestration/
│   ├── dependency-manager.js    # Dependency graph
│   ├── agent-task-system.js     # Task allocation
│   └── git-operations.js        # Git integration
```

## API

### `WorkflowOrchestrator`

```javascript
const orchestrator = new WorkflowOrchestrator(options);
```

**Methods:**
- `initialize()`: Initialize the orchestrator
- `createPipeline(id, steps)`: Create a pipeline
- `executePipeline(id)`: Execute a pipeline
- `registerAgent(id, config)`: Register an agent
- `getStatus()`: Get orchestration status

### `PipelineManager`

```javascript
const { PipelineManager } = require('@bumba/orchestration');
```

**Methods:**
- `create(definition)`: Create pipeline from definition
- `execute(id, context)`: Execute with context
- `pause(id)`: Pause execution
- `resume(id)`: Resume execution

## Dependencies

- `@bumba/shared` - Shared utilities

## Optional Integrations

- `@bumba/memory` - For pipeline state persistence
- `@bumba/observability` - For execution tracing

## License

MIT
