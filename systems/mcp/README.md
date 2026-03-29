# @bumba/mcp

Model Context Protocol (MCP) server management with health monitoring and error recovery.

**Comparable to:** MCP reference implementation

## Installation

```bash
npm install @bumba/mcp
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { MCPManager } = require('@bumba/mcp');

const mcp = new MCPManager();

// Register MCP servers
mcp.registerServer('filesystem', {
  command: 'npx',
  args: ['-y', '@anthropic/mcp-server-filesystem', '/path/to/dir']
});

mcp.registerServer('github', {
  command: 'npx',
  args: ['-y', '@anthropic/mcp-server-github'],
  env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN }
});

// Start servers
await mcp.startAll();

// Use MCP tools
const tools = await mcp.getTools('filesystem');
```

## Features

- **Server Management**: Start, stop, restart servers
- **Health Monitoring**: Track server health
- **Error Recovery**: Automatic restart on crash
- **Tool Discovery**: List available tools
- **Connection Pooling**: Efficient connection management

## Architecture

```
mcp/
├── mcp-manager.js          # Server lifecycle
├── health-monitor.js       # Health checks
├── error-recovery.js       # Error handling
├── connection-pool.js      # Connection management
└── tool-registry.js        # Tool registration
```

## API

### `MCPManager`

```javascript
const mcp = new MCPManager(options);
```

**Methods:**
- `registerServer(name, config)`: Register a server
- `startServer(name)`: Start a server
- `stopServer(name)`: Stop a server
- `startAll()`: Start all servers
- `getTools(server)`: Get server tools
- `callTool(server, tool, args)`: Call a tool

### Health Monitoring

```javascript
mcp.on('server:unhealthy', (name, error) => {
  console.log(`Server ${name} is unhealthy: ${error}`);
});
```

## Dependencies

- `@bumba/shared` - Shared utilities

## License

MIT
