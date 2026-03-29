# @bumba/token-cost-manager

Real-time token cost tracking and budget enforcement for LLM applications.

## Installation

```bash
npm install @bumba/token-cost-manager
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { TokenCostManager } = require('@bumba/token-cost-manager');

const costManager = new TokenCostManager({
  budget: 10.00,  // $10 daily budget
  alertThreshold: 0.8  // Alert at 80% usage
});

// Track usage
costManager.trackUsage({
  model: 'claude-3-opus',
  inputTokens: 1000,
  outputTokens: 500
});

// Check budget
if (costManager.isOverBudget()) {
  console.log('Budget exceeded!');
}
```

## Features

- **Cost Calculation**: Accurate pricing per model
- **Budget Enforcement**: Hard limits with alerts
- **Usage Analytics**: Track costs over time
- **Multi-Model Support**: Claude, GPT-4, etc.

## API

### `TokenCostManager`

```javascript
const manager = new TokenCostManager(options);
```

**Methods:**
- `trackUsage(usage)`: Record token usage
- `getCost()`: Get current session cost
- `isOverBudget()`: Check budget status
- `getReport()`: Get usage report

## Dependencies

- `@bumba/shared` - Shared utilities

## License

MIT
