/**
 * API Integration Manager for BUMBA
 * Sprint 34: Unified interface for all API connectors
 */

const EventEmitter = require('events');

// Import all connectors
const OpenAIConnector = require('./openai-connector');
const AnthropicConnector = require('./anthropic-connector');
const GoogleAIConnector = require('./google-ai-connector');
const GitHubConnector = require('./github-connector');
const NotionConnector = require('./notion-connector');
const SlackConnector = require('./slack-connector');
const DiscordConnector = require('./discord-connector');
const PineconeConnector = require('./pinecone-connector');
const WebSearchConnector = require('./websearch-connector');
const DatabaseConnector = require('./database-connector');

class APIIntegrationManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = config;
    this.connectors = {};
    this.initialized = false;
    
    // Track API usage across all connectors
    this.globalUsage = {
      requests: 0,
      errors: 0,
      totalCost: 0,
      byProvider: {}
    };
  }

  async initialize() {
    if (this.initialized) return;
    
    // Initialize AI connectors
    if (this.config.apiKeys?.openai) {
      this.connectors.openai = new OpenAIConnector({
        apiKey: this.config.apiKeys.openai
      });
      this.setupConnectorEvents('openai');
    }
    
    if (this.config.apiKeys?.anthropic) {
      this.connectors.anthropic = new AnthropicConnector({
        apiKey: this.config.apiKeys.anthropic
      });
      this.setupConnectorEvents('anthropic');
    }
    
    if (this.config.apiKeys?.google) {
      this.connectors.google = new GoogleAIConnector({
        apiKey: this.config.apiKeys.google
      });
      this.setupConnectorEvents('google');
    }
    
    // Initialize service connectors
    if (this.config.apiKeys?.github) {
      this.connectors.github = new GitHubConnector({
        token: this.config.apiKeys.github
      });
      this.setupConnectorEvents('github');
    }
    
    if (this.config.apiKeys?.notion) {
      this.connectors.notion = new NotionConnector({
        apiKey: this.config.apiKeys.notion
      });
      this.setupConnectorEvents('notion');
    }
    
    if (this.config.apiKeys?.slack) {
      this.connectors.slack = new SlackConnector({
        token: this.config.apiKeys.slack
      });
      this.setupConnectorEvents('slack');
    }
    
    if (this.config.apiKeys?.discord) {
      this.connectors.discord = new DiscordConnector({
        token: this.config.apiKeys.discord,
        webhookURL: this.config.discordWebhook
      });
      this.setupConnectorEvents('discord');
    }
    
    if (this.config.apiKeys?.pinecone) {
      this.connectors.pinecone = new PineconeConnector({
        apiKey: this.config.apiKeys.pinecone,
        environment: this.config.pineconeEnvironment,
        projectName: this.config.pineconeProject
      });
      this.setupConnectorEvents('pinecone');
    }
    
    // Initialize search connector (can work without API key for DuckDuckGo)
    this.connectors.search = new WebSearchConnector({
      googleApiKey: this.config.apiKeys?.googleSearch,
      googleCseId: this.config.googleCseId,
      bingApiKey: this.config.apiKeys?.bing,
      braveApiKey: this.config.apiKeys?.brave
    });
    this.setupConnectorEvents('search');
    
    // Initialize database connector if configured
    if (this.config.database) {
      this.connectors.database = new DatabaseConnector(this.config.database);
      this.setupConnectorEvents('database');
    }
    
    this.initialized = true;
    this.emit('initialized', { connectors: Object.keys(this.connectors) });
  }

  setupConnectorEvents(name) {
    const connector = this.connectors[name];
    
    if (connector.on) {
      connector.on('usage', (usage) => {
        this.trackUsage(name, usage);
      });
      
      connector.on('error', (error) => {
        this.globalUsage.errors++;
        this.emit('connector:error', { connector: name, error });
      });
    }
  }

  trackUsage(provider, usage) {
    this.globalUsage.requests++;
    
    if (!this.globalUsage.byProvider[provider]) {
      this.globalUsage.byProvider[provider] = {
        requests: 0,
        cost: 0,
        tokens: 0
      };
    }
    
    this.globalUsage.byProvider[provider].requests++;
    
    if (usage.cost) {
      this.globalUsage.byProvider[provider].cost += usage.cost;
      this.globalUsage.totalCost += usage.cost;
    }
    
    if (usage.tokens || usage.totalTokens) {
      this.globalUsage.byProvider[provider].tokens += (usage.tokens || usage.totalTokens);
    }
    
    this.emit('usage', { provider, usage, global: this.globalUsage });
  }

  // Unified chat interface
  async chat(message, options = {}) {
    const provider = options.provider || this.getDefaultChatProvider();
    const connector = this.connectors[provider];
    
    if (!connector) {
      throw new Error(`Chat provider ${provider} not available`);
    }
    
    switch (provider) {
      case 'openai':
        return connector.chatCompletion(message, options);
      case 'anthropic':
        return connector.createMessage(message, options);
      case 'google':
        return connector.generateContent(message, options);
      default:
        throw new Error(`Chat not supported for ${provider}`);
    }
  }

  // Unified embedding interface
  async createEmbedding(text, options = {}) {
    const provider = options.provider || 'openai';
    const connector = this.connectors[provider];
    
    if (!connector) {
      throw new Error(`Embedding provider ${provider} not available`);
    }
    
    switch (provider) {
      case 'openai':
        return connector.createEmbedding(text, options);
      case 'google':
        return connector.embedContent(text, options);
      default:
        throw new Error(`Embeddings not supported for ${provider}`);
    }
  }

  // Unified search interface
  async search(query, options = {}) {
    if (!this.connectors.search) {
      throw new Error('Search connector not available');
    }
    
    return this.connectors.search.search(query, options);
  }

  // Unified database interface
  async query(sql, params) {
    if (!this.connectors.database) {
      throw new Error('Database connector not available');
    }
    
    return this.connectors.database.query(sql, params);
  }

  // Get specific connector
  getConnector(name) {
    return this.connectors[name];
  }

  // Get all available connectors
  getAvailableConnectors() {
    return Object.keys(this.connectors);
  }

  // Get default chat provider based on availability
  getDefaultChatProvider() {
    if (this.connectors.anthropic) return 'anthropic';
    if (this.connectors.openai) return 'openai';
    if (this.connectors.google) return 'google';
    throw new Error('No chat provider available');
  }

  // Multi-provider chat (get responses from multiple providers)
  async multiChat(message, providers = [], options = {}) {
    const availableProviders = providers.length > 0 
      ? providers 
      : ['openai', 'anthropic', 'google'].filter(p => this.connectors[p]);
    
    const promises = availableProviders.map(provider => 
      this.chat(message, { ...options, provider })
        .then(response => ({ provider, response, success: true }))
        .catch(error => ({ provider, error: error.message, success: false }))
    );
    
    const results = await Promise.all(promises);
    
    return {
      responses: results.filter(r => r.success),
      errors: results.filter(r => !r.success)
    };
  }

  // Execute tool/function across providers
  async executeTool(tool, args, options = {}) {
    const provider = options.provider || this.getDefaultChatProvider();
    const connector = this.connectors[provider];
    
    if (!connector) {
      throw new Error(`Provider ${provider} not available`);
    }
    
    // Format tool for different providers
    switch (provider) {
      case 'openai':
        return connector.chatCompletion(
          [{ role: 'user', content: options.prompt || 'Execute the function' }],
          {
            ...options,
            functions: [tool],
            function_call: { name: tool.name, arguments: JSON.stringify(args) }
          }
        );
        
      case 'anthropic':
        return connector.callFunction(
          [{ role: 'user', content: options.prompt || 'Execute the tool' }],
          [tool],
          options
        );
        
      case 'google':
        return connector.callFunction(
          options.prompt || 'Execute the function',
          [tool],
          options
        );
        
      default:
        throw new Error(`Tool execution not supported for ${provider}`);
    }
  }

  // Rate limit management
  async waitForRateLimit(provider) {
    const connector = this.connectors[provider];
    
    if (connector && connector.rateLimits) {
      const limits = connector.rateLimits;
      
      // Check if we need to wait
      if (limits.requests && limits.requests.remaining === 0) {
        const waitTime = limits.requests.resetAt - Date.now();
        if (waitTime > 0) {
          await this.delay(waitTime);
        }
      }
    }
  }

  // Get usage statistics
  getUsageStats() {
    const stats = {
      global: this.globalUsage,
      byProvider: {}
    };
    
    // Get provider-specific stats
    for (const [name, connector] of Object.entries(this.connectors)) {
      if (connector.getUsage) {
        stats.byProvider[name] = connector.getUsage();
      }
    }
    
    return stats;
  }

  // Reset usage statistics
  resetUsageStats() {
    this.globalUsage = {
      requests: 0,
      errors: 0,
      totalCost: 0,
      byProvider: {}
    };
    
    // Reset provider-specific stats
    for (const connector of Object.values(this.connectors)) {
      if (connector.resetUsage) {
        connector.resetUsage();
      }
    }
  }

  // Validate all configured API keys
  async validateAllKeys() {
    const results = {};
    
    for (const [name, connector] of Object.entries(this.connectors)) {
      if (connector.validateApiKey || connector.validateToken) {
        try {
          const validation = await (connector.validateApiKey || connector.validateToken).call(connector);
          results[name] = validation;
        } catch (error) {
          results[name] = { valid: false, error: error.message };
        }
      } else {
        results[name] = { valid: true, message: 'No validation available' };
      }
    }
    
    return results;
  }

  // Cleanup
  async cleanup() {
    for (const connector of Object.values(this.connectors)) {
      if (connector.disconnect) {
        await connector.disconnect();
      }
      if (connector.cleanup) {
        await connector.cleanup();
      }
    }
    
    this.connectors = {};
    this.initialized = false;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = APIIntegrationManager;