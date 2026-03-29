# @bumba/status-line

Dynamic terminal status line with progress indicators and spinners.

## Installation

```bash
npm install @bumba/status-line
npm install chalk  # Required peer dependency
```

## Quick Start

```javascript
const { DynamicStatusLine } = require('@bumba/status-line');

const status = new DynamicStatusLine();

status.start('Processing files...');
status.update('Processing file 1/10');
status.update('Processing file 2/10');
// ...
status.succeed('All files processed!');
```

## Features

- **Spinner Animation**: Multiple spinner styles
- **Progress Bar**: Show completion percentage
- **Multi-Line**: Multiple concurrent status lines
- **Color Support**: Chalk integration

## API

### `DynamicStatusLine`

```javascript
const status = new DynamicStatusLine(options);
```

**Options:**
- `spinner` (string): Spinner style name
- `color` (string): Status line color

**Methods:**
- `start(text)`: Start the spinner
- `update(text)`: Update status text
- `succeed(text)`: Show success
- `fail(text)`: Show failure
- `stop()`: Stop the spinner

## Dependencies

- `chalk` - Terminal colors

## License

MIT
