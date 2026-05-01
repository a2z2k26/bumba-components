# 🟢 Tool Bridge Quick Start Guide

**Part of the BUMBA Platform Suite**

Get Tool Bridge up and running in 5 minutes!

## 🟡 Prerequisites

- Node.js 16+ installed
- At least one AI API key (OpenAI, Anthropic, or Google)

## 🔴 Installation

### 🟠 Option 1: NPM (Recommended)

```bash
npm install -g tool-bridge
```

### 🟢 Option 2: From Source

```bash
git clone https://github.com/bumba-platform/tool-bridge.git
cd tool-bridge
npm install
npm link
```

## 🟡 Initial Setup

1. **Run the setup wizard:**
```bash
tool-bridge setup
```

2. **Choose your setup path:**
- **Quick Setup**: Configure one AI provider quickly
- **Complete Setup**: Configure all providers
- **Selective Setup**: Choose specific components
- **Skip All**: Set up manually later

3. **Start Tool Bridge:**
```bash
tool-bridge start
```

Your Tool Bridge gateway is now running at `http://localhost:3456`! 🏁

## 🔴 Your First API Call

### Using cURL
```bash
curl -X POST http://localhost:3456/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Using Node.js
```javascript
const axios = require('axios');

const response = await axios.post('http://localhost:3456/api/chat', {
  provider: 'openai',
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: 'Hello!' }]
});

console.log(response.data);
```

## 🟠 Next Steps

- [Configure additional providers](./providers.md)
- [Set up authentication](./authentication.md)
- [Deploy with Docker](./docker.md)
- [Integrate MCP servers](./mcp-servers.md)

## 🟢 Troubleshooting

### Port already in use
```bash
tool-bridge start --port 3457
```

### API key not working
```bash
tool-bridge test --api openai
```

### Reset configuration
```bash
tool-bridge setup --reset
```

## 🏁 Getting Help

- Check the [FAQ](./faq.md)
- Open an [issue on GitHub](https://github.com/bumba-platform/tool-bridge/issues)
- Read the [full documentation](../README.md)

---

**Tool Bridge** - Part of the **BUMBA Platform Suite**