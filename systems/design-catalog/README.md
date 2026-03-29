# @bumba/design-catalog

Design system catalog generation with Figma integration and component analysis.

**Comparable to:** Storybook, Chromatic

## Installation

```bash
npm install @bumba/design-catalog
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { CatalogGenerator } = require('@bumba/design-catalog');

const generator = new CatalogGenerator({
  outputDir: './design-catalog',
  figmaToken: process.env.FIGMA_TOKEN
});

// Generate catalog from Figma
await generator.generate({
  fileKey: 'YOUR_FIGMA_FILE_KEY',
  components: ['Button', 'Input', 'Card']
});
```

## Features

- **Figma Sync**: Import from Figma designs
- **Component Analysis**: Extract component specs
- **Accessibility Audit**: A11y compliance checks
- **Token Extraction**: Design token generation
- **Documentation**: Auto-generate docs
- **Conflict Resolution**: Handle design conflicts

## Architecture

```
design-catalog/
├── catalog-generator.js           # Main generator
├── catalog-orchestrator.js        # Orchestration
├── component-analyzer.js          # Component analysis
├── accessibility-automation.js    # A11y checks
├── ai-assistant.js                # AI descriptions
├── conflict-resolver.js           # Conflict handling
└── components/                    # Component templates
    ├── button.html
    ├── input.html
    └── ...
```

## API

### `CatalogGenerator`

```javascript
const generator = new CatalogGenerator(options);
```

**Options:**
- `outputDir` (string): Output directory
- `figmaToken` (string): Figma API token
- `theme` (object): Theme configuration

**Methods:**
- `generate(options)`: Generate catalog
- `sync(fileKey)`: Sync from Figma
- `analyze(component)`: Analyze component
- `exportTokens()`: Export design tokens

### Component Analysis

```javascript
const { ComponentAnalyzer } = require('@bumba/design-catalog');

const analyzer = new ComponentAnalyzer();
const spec = await analyzer.analyze(componentHtml);
console.log(spec.accessibility);  // A11y report
console.log(spec.tokens);         // Design tokens
```

## Core Principles

1. **Semantic Preservation**: Maintain design intent, not just visual properties
2. **Continuous Synchronization**: Design and code stay in perfect parity
3. **Intelligent Automation**: AI-enhanced translation with context awareness
4. **Developer Empowerment**: Automate repetition, preserve creativity
5. **Designer Confidence**: Changes propagate without manual translation

## Dependencies

- `@bumba/shared` - Shared utilities

## Optional Integrations

- Figma API for design sync
- AI provider for descriptions

## License

MIT
