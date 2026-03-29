/**
 * BUMBA AI Gateway - Unified Export Interface
 * Multi-provider AI/LLM integration with intelligent routing
 * @module ai-gateway
 */

const { logger } = require('@bumba/shared');

// Core AI components - loaded lazily to handle optional dependencies
const modules = {};

// Helper to safely load a module
function safeRequire(path, name) {
  try {
    return require(path);
  } catch (e) {
    logger.debug(`[AI Gateway] Optional module ${name} not loaded:`, e.message);
    return null;
  }
}

// Connectors
const connectorPath = './connectors';
const connectors = {
  get AnthropicConnector() { return safeRequire(`${connectorPath}/anthropic-connector`, 'anthropic'); },
  get GoogleAIConnector() { return safeRequire(`${connectorPath}/google-ai-connector`, 'google-ai'); },
  get OpenAIConnector() { return safeRequire(`${connectorPath}/openai-connector`, 'openai'); },
  get BaseConnector() { return safeRequire(`${connectorPath}/base-connector`, 'base'); },
  get AIIntegrationManager() { return safeRequire(`${connectorPath}/ai-integration-manager`, 'ai-integration'); },
};

// Core AI modules
const corePath = './core';
const core = {
  get ContextManager() { return safeRequire(`${corePath}/context-manager`, 'context-manager'); },
  get ModelComparison() { return safeRequire(`${corePath}/model-comparison`, 'model-comparison'); },
  get ModelAliasManager() { return safeRequire(`${corePath}/model-alias-manager`, 'model-alias'); },
  get MultiAPIOrchestrator() { return safeRequire(`${corePath}/multi-api-orchestrator`, 'multi-api'); },
  get TokenOptimizer() { return safeRequire(`${corePath}/token-optimizer`, 'token-optimizer'); },
  get PromptTemplateEngine() { return safeRequire(`${corePath}/prompt-template-engine`, 'prompt-template'); },
  get ResponseProcessor() { return safeRequire(`${corePath}/response-processor`, 'response-processor'); },
};

// Main AI Gateway class
class AIGateway {
  constructor(config = {}) {
    this.config = config;
    this.providers = new Map();
    this.defaultProvider = config.defaultProvider || 'anthropic';
    logger.info('AI Gateway initialized');
  }

  async initialize() {
    // Initialize default provider
    const providerConfig = this.config.providers?.[this.defaultProvider] || {};
    const connector = this.getConnector(this.defaultProvider);
    if (connector) {
      this.providers.set(this.defaultProvider, new connector(providerConfig));
    }
    return this;
  }

  getConnector(name) {
    const connectorMap = {
      'anthropic': connectors.AnthropicConnector,
      'google': connectors.GoogleAIConnector,
      'openai': connectors.OpenAIConnector,
    };
    return connectorMap[name] || connectors.BaseConnector;
  }

  async complete(prompt, options = {}) {
    const provider = options.provider || this.defaultProvider;
    const connector = this.providers.get(provider);
    if (!connector) {
      throw new Error(`Provider ${provider} not initialized`);
    }
    return connector.complete(prompt, options);
  }

  async chat(messages, options = {}) {
    const provider = options.provider || this.defaultProvider;
    const connector = this.providers.get(provider);
    if (!connector) {
      throw new Error(`Provider ${provider} not initialized`);
    }
    return connector.chat(messages, options);
  }
}

module.exports = {
  // Main gateway
  AIGateway,

  // Connectors
  ...connectors,

  // Core modules
  ...core,

  // Factory function
  createGateway: (config) => new AIGateway(config),
};
