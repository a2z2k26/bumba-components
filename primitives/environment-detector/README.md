# @bumba/environment-detector

Intelligent runtime environment detection for multi-platform applications.

## Installation

```bash
npm install @bumba/environment-detector
```

## Quick Start

```javascript
const { EnvironmentDetector } = require('@bumba/environment-detector');

const env = new EnvironmentDetector();

console.log(env.detect());
// { platform: 'darwin', isDocker: false, isCLI: true, ... }
```

## Features

- **Platform Detection**: macOS, Linux, Windows
- **Container Detection**: Docker, Kubernetes
- **Runtime Detection**: Node.js version, CLI vs programmatic
- **CI/CD Detection**: GitHub Actions, GitLab CI, Jenkins

## API

### `EnvironmentDetector`

```javascript
const detector = new EnvironmentDetector();
```

**Methods:**
- `detect()`: Get complete environment info
- `getPlatform()`: Get OS platform
- `isDocker()`: Check if running in Docker
- `isCI()`: Check if running in CI environment

## Zero Dependencies

This primitive has no external dependencies beyond Node.js built-ins.

## License

MIT
