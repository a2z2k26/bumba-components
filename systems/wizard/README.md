# @bumba/wizard

Interactive CLI setup wizard with API key management and platform detection.

**Comparable to:** Inquirer.js, Yeoman

## Installation

```bash
npm install @bumba/wizard
npm install @bumba/shared  # Required peer dependency
npm install chalk ora      # Required for CLI UI
```

## Quick Start

```javascript
const { BumbaSetupWizard } = require('@bumba/wizard');

const wizard = new BumbaSetupWizard({
  configPath: './.env'
});

// Run the setup wizard
await wizard.run();

// Or run specific steps
await wizard.runStep('api-keys');
```

## Features

- **Multi-Step Wizard**: Guided configuration flow
- **API Key Management**: Secure key handling
- **Platform Detection**: Auto-detect OS settings
- **Config Migration**: Migrate from legacy configs
- **Validation**: Input validation with helpful errors
- **Progress Tracking**: Visual step progress

## Architecture

```
wizard/
├── index.js                  # Main wizard
├── config-schema.js          # Configuration schema
├── validation-framework.js   # Input validation
├── api-key-manager.js        # API key handling
├── platform-detector.js      # OS detection
├── config-migrator.js        # Legacy migration
└── env-file-writer.js        # .env generation
```

## API

### `BumbaSetupWizard`

```javascript
const wizard = new BumbaSetupWizard(options);
```

**Options:**
- `configPath` (string): Path to save config
- `interactive` (boolean): Enable prompts
- `verbose` (boolean): Verbose output

**Methods:**
- `run()`: Run full wizard
- `runStep(stepId)`: Run specific step
- `validate()`: Validate current config
- `save()`: Save configuration

### Events

```javascript
wizard.on('step:complete', (step) => {
  console.log(`Completed: ${step.name}`);
});

wizard.on('error', (error) => {
  console.error(`Error: ${error.message}`);
});
```

## Dependencies

- `@bumba/shared` - Shared utilities
- `chalk` - Terminal colors
- `ora` - Spinners

## License

MIT
