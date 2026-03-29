# @bumba/config-manager

Configuration management with environment detection and validation.

## Installation

```bash
npm install @bumba/config-manager
```

## Quick Start

```javascript
const { ConfigManager } = require('@bumba/config-manager');

const config = new ConfigManager({
  configPath: './config',
  env: process.env.NODE_ENV
});

// Load configuration
await config.load();

// Access config values
const apiKey = config.get('api.key');
const timeout = config.get('api.timeout', 30000);  // With default
```

## Features

- **Environment-Based**: Load config per environment
- **Validation**: Schema validation support
- **Defaults**: Merge with default values
- **Hot Reload**: Watch for config changes

## API

### `ConfigManager`

```javascript
const config = new ConfigManager(options);
```

**Options:**
- `configPath` (string): Config directory path
- `env` (string): Environment name

**Methods:**
- `load()`: Load configuration
- `get(path, defaultValue)`: Get config value
- `set(path, value)`: Set config value
- `watch()`: Watch for changes

## Zero Dependencies

This primitive has no external dependencies beyond Node.js built-ins.

## License

MIT
