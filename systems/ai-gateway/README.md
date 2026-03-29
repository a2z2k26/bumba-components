# @bumba/ai-gateway

Unified multi-provider AI interface with intelligent routing, cost optimization, and streaming support.

**Comparable to:** LiteLLM, Portkey, Martian

## Installation

```bash
npm install @bumba/ai-gateway
npm install @bumba/shared  # Required peer dependency
```

## Quick Start

```javascript
const { AIGateway } = require('@bumba/ai-gateway');

const gateway = new AIGateway({
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    openai: { apiKey: process.env.OPENAI_API_KEY }
  }
});

await gateway.initialize();

// Use any provider with unified API
const response = await gateway.complete('Explain quantum computing', {
  provider: 'anthropic',
  model: 'claude-3-opus'
});
```

## Features

- **Multi-Provider**: Anthropic, OpenAI, Google AI, and more
- **Intelligent Routing**: Auto-select best provider/model
- **Cost Optimization**: Track and minimize costs
- **Streaming**: Full streaming support
- **Fallback**: Automatic provider fallback
- **Rate Limiting**: Built-in rate limit handling

## Architecture

```
ai-gateway/
├── connectors/
│   ├── anthropic-connector.js   # Claude integration
│   ├── openai-connector.js      # GPT integration
│   ├── google-ai-connector.js   # Gemini integration
│   └── base-connector.js        # Base class
├── core/
│   ├── context-manager.js       # Context handling
│   ├── model-alias-manager.js   # Model aliasing
│   └── multi-api-orchestrator.js # Multi-API coordination
```

## API

### `AIGateway`

```javascript
const gateway = new AIGateway(options);
```

**Options:**
- `providers` (object): Provider configurations
- `defaultProvider` (string): Default provider name

**Methods:**
- `initialize()`: Initialize the gateway
- `complete(prompt, options)`: Complete a prompt
- `chat(messages, options)`: Chat completion
- `stream(prompt, options)`: Streaming completion

### Provider Connectors

```javascript
const { AnthropicConnector, OpenAIConnector } = require('@bumba/ai-gateway');
```

## Dependencies

- `@bumba/shared` - Shared utilities

## Optional Integrations

- `@bumba/token-optimizer` - For token optimization
- `@bumba/rate-limiter` - For advanced rate limiting

## License

MIT
