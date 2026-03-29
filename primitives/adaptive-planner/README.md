# @bumba/adaptive-planner

Adaptive task planning with performance-based adjustments.

## Installation

```bash
npm install @bumba/adaptive-planner
```

## Quick Start

```javascript
const { AdaptivePlanner } = require('@bumba/adaptive-planner');

const planner = new AdaptivePlanner();

// Create a plan
const plan = planner.createPlan({
  goal: 'Implement user authentication',
  constraints: {
    maxTime: 3600000,  // 1 hour
    maxCost: 5.00      // $5 budget
  }
});

// Execute with adaptation
await planner.execute(plan, {
  onProgress: (step) => console.log(`Completed: ${step.name}`)
});
```

## Features

- **Goal-Based Planning**: Define goals, get plans
- **Constraint Handling**: Time and cost limits
- **Adaptive Execution**: Adjust based on results
- **Progress Tracking**: Monitor execution

## API

### `AdaptivePlanner`

```javascript
const planner = new AdaptivePlanner(options);
```

**Methods:**
- `createPlan(goal, constraints)`: Create execution plan
- `execute(plan, options)`: Execute with adaptation
- `adjust(plan, feedback)`: Adjust plan based on feedback

## Zero Dependencies

This primitive has no external dependencies beyond Node.js built-ins.

## License

MIT
