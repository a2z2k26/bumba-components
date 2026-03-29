# @bumba/shell-security

Secure shell command execution with injection prevention and sandboxing for CLI tools.

## Installation

```bash
npm install @bumba/shell-security
```

## Quick Start

```javascript
const { ShellSecurity } = require('@bumba/shell-security');

const shell = new ShellSecurity();

// Safe command execution with injection prevention
const result = await shell.execute('git', ['status', '--porcelain']);

// Validate user input before command construction
const sanitized = shell.sanitizeInput(userInput);
```

## Features

- **Injection Prevention**: Blocks command injection attacks
- **Input Sanitization**: Clean user input for safe use
- **Command Allowlisting**: Restrict executable commands
- **Argument Validation**: Ensure safe argument patterns

## API

### `ShellSecurity`

```javascript
const shell = new ShellSecurity(options);
```

**Options:**
- `allowedCommands` (string[]): Whitelist of allowed commands
- `timeout` (number): Command execution timeout in ms

**Methods:**
- `execute(command, args)`: Execute a shell command safely
- `sanitizeInput(input)`: Sanitize user input
- `isAllowed(command)`: Check if command is allowed

## Zero Dependencies

This primitive has no external dependencies beyond Node.js built-ins.

## License

MIT
