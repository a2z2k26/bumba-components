```
██████╗  █████╗ ██████╗ ██╗   ██╗██╗      ██████╗ ███╗   ██╗
██╔══██╗██╔══██╗██╔══██╗╚██╗ ██╔╝██║     ██╔═══██╗████╗  ██║
██████╔╝███████║██████╔╝ ╚████╔╝ ██║     ██║   ██║██╔██╗ ██║
██╔══██╗██╔══██║██╔══██╗  ╚██╔╝  ██║     ██║   ██║██║╚██╗██║
██████╔╝██║  ██║██████╔╝   ██║   ███████╗╚██████╔╝██║ ╚████║
╚═════╝ ╚═╝  ╚═╝╚═════╝    ╚═╝   ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝
```

<div align="center">

#  Tool Bridge - Universal AI Gateway Primitive

**A Core Component of the Agent Primitives**

[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-00AA00)](https://nodejs.org)
[![Agent Primitives](https://img.shields.io/badge/BUMBA-Platform-FFDD00)](https://github.com/a2z2k26/agent-primitives)

</div>

---

##  Overview

**Tool Bridge is a foundational primitive for AI infrastructure - a universal gateway component that unifies multiple AI providers.**

Switch between OpenAI, Anthropic, and Google AI instantly. No code changes needed. This building block handles all the protocol translation and routing complexity for you.

##  Core Capabilities

- ** Protocol Translation** - Use any SDK with any provider
- ** Unified Interface** - Single endpoint for all AI providers
- ** Built-in Security** - JWT, rate limiting, CORS protection
- ** Stream Support** - WebSocket real-time responses
- ** Docker Ready** - Deploy anywhere instantly

##  Installation

```bash
# npm (recommended)
npm install -g tool-bridge

# Docker
docker pull tool-bridge:latest

# From source
git clone https://github.com/a2z2k26/agent-primitives.git
cd tool-bridge && npm install && npm link
```

##  Quick Start

```bash
# Setup & start
tool-bridge setup  # First time only
tool-bridge start  # Launch gateway
```

```javascript
// Use this primitive with any SDK
const openai = new OpenAI({
  baseURL: 'http://localhost:3456/v1',
  apiKey: 'your-key'
});

// Transparently routes to configured provider
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

##  Commands

```bash
tool-bridge start            # Launch gateway
tool-bridge setup            # Configure APIs
tool-bridge status           # Check status
tool-bridge test             # Test connections
```

##  API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /v1/chat/completions` | OpenAI compatible |
| `POST /v1/messages` | Anthropic compatible |
| `POST /api/chat` | Unified interface |
| `GET /api/models` | List available models |
| `GET /health` | Health check |

##  Configuration

Configuration lives in `~/.tool-bridge/config.json` - managed via CLI or direct editing.

##  Docker

```bash
docker run -p 3456:3456 \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  tool-bridge:latest
```

##  Security

Built-in JWT authentication, rate limiting, CORS protection, and centralized API key management.

##  Support

- **Issues**: [GitHub Issues](https://github.com/a2z2k26/agent-primitives/issues)

##  License

MIT License - see [LICENSE](LICENSE) file for details.

---

<div align="center">

** Tool Bridge** - A **Agent Primitives** Primitive

*Building Unified Multi-agent Business Applications*

</div>