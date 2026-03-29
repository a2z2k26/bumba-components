# @bumba/model-comparison

Compare LLM model outputs for quality, cost, and performance analysis.

## Installation

```bash
npm install @bumba/model-comparison
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { ModelComparison } = require('@bumba/model-comparison');

const comparator = new ModelComparison();

const results = await comparator.compare({
  prompt: 'Explain REST APIs',
  models: ['claude-3-opus', 'claude-3-sonnet', 'gpt-4']
});

console.log(results.ranking);  // Ranked by quality/cost ratio
```

## Features

- **Side-by-Side Comparison**: Compare multiple models
- **Quality Scoring**: Evaluate response quality
- **Cost Analysis**: Compare cost per response
- **Latency Tracking**: Measure response times

## API

### `ModelComparison`

```javascript
const comparator = new ModelComparison(options);
```

**Methods:**
- `compare(options)`: Compare models on same prompt
- `getRanking()`: Get ranked model recommendations
- `getCostComparison()`: Compare costs

## Dependencies

- `@bumba/shared` - Shared utilities

## License

MIT
