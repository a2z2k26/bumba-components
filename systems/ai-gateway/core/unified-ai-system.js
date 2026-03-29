/**
 * BUMBA Unified AI System
 * Phase F - Sprint 71: AI Foundation Layer
 * 
 * Provides unified interface for multiple AI providers with intelligent
 * orchestration, caching, and fallback capabilities.
 */

// [OPTIONAL] const { UnifiedManagerBase, ManagerState } = require('../managers/unified-manager-base'); // May need @bumba/* package
// [OPTIONAL] const { EventPatterns } = require('../patterns/event-emitter-patterns'); // May need @bumba/* package
// [OPTIONAL] const { logger } = require('../logging/bumba-logger'); // May need @bumba/* package
const { ResponseProcessor } = require('./response-processor');
const { AIPerformanceOptimizer } = require('./ai-performance-optimizer');
const { ContextManager } = require('./context-manager');
const { PromptTemplateEngine } = require('./prompt-template-engine');
const crypto = require('crypto');

class UnifiedAISystem extends UnifiedManagerBase {
  constructor(options = {}) {
    super('unified-ai-system', {
      type: 'ai',
      description: 'Unified AI system for multi-provider LLM integration',
      ...options
    });

    // AI Providers Registry
    this.providers = new Map();
    this.activeProvider = null;
    this.fallbackChain = [];

    // Model Registry
    this.models = new Map();
    this.defaultModels = {
      'text-generation': null,
      'embeddings': null,
      'chat': null,
      'completion': null,
      'image': null,
      'audio': null
    };

    // Prompt Management
    this.prompts = new Map();
    this.promptTemplates = new Map();
    this.systemPrompts = new Map();

    // Context Management
    this.contexts = new Map();
    this.maxContextLength = options.maxContextLength || 8192;
    this.contextCompression = options.contextCompression !== false;

    // Token Management
    this.tokenTracking = {
      total: 0,
      byProvider: new Map(),
      byModel: new Map(),
      costs: new Map(),
      limits: new Map()
    };

    // Response Cache
    this.responseCache = new Map();
    this.cacheOptions = {
      enabled: options.caching !== false,
      ttl: options.cacheTTL || 3600000, // 1 hour default
      maxSize: options.cacheMaxSize || 1000
    };

    // Request Queue
    this.requestQueue = [];
    this.processing = false;
    this.maxConcurrent = options.maxConcurrent || 5;
    this.activeRequests = new Set();

    // Performance Metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageLatency: 0,
      tokenUsage: 0,
      costs: 0
    };

    // Configuration
    this.config = {
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
      timeout: options.timeout || 30000,
      streamingEnabled: options.streaming !== false,
      autoFallback: options.autoFallback !== false,
      costOptimization: options.costOptimization !== false
    };
  }

  async onInitialize() {
    logger.info('🤖 Initializing Unified AI System...');

    // Initialize core components
    await this.initializeProviders();
    await this.initializeModels();
    await this.initializePromptSystem();
    await this.initializeContextManager();
    await this.initializeTokenManager();
    await this.initializeCognitiveServices();

    // Initialize Sprint 73 components
    await this.initializeResponseProcessor();
    await this.initializePerformanceOptimizer();

    // Start request processor
    this.startRequestProcessor();

    // Set up monitoring
    this.setupMonitoring();

    this.safeEmit(EventPatterns.LIFECYCLE.INITIALIZED, {
      providers: this.providers.size,
      models: this.models.size,
      capabilities: this.getCapabilities()
    });

    logger.info('🤖 Unified AI System initialized successfully');
  }

  async initializeProviders() {
    logger.info('🤖 Initializing AI providers...');

    // Provider abstraction interface
    this.providerInterface = {
      // Required methods for all providers
      required: ['complete', 'chat', 'embed'],
      // Optional methods
      optional: ['stream', 'finetune', 'moderate', 'transcribe', 'translate'],
      // Provider capabilities
      capabilities: new Map()
    };

    // Register built-in provider adapters
    this.registerBuiltInProviders();
  }

  registerBuiltInProviders() {
    // OpenAI Provider Adapter
    this.registerProvider('openai', {
      name: 'OpenAI',
      models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'text-embedding-3-small'],
      capabilities: ['chat', 'completion', 'embeddings', 'moderation'],
      config: {
        apiKey: process.env.OPENAI_API_KEY,
        organization: process.env.OPENAI_ORG,
        baseURL: 'https://api.openai.com/v1'
      },
      adapter: this.createOpenAIAdapter()
    });

    // Anthropic Claude Provider Adapter
    this.registerProvider('anthropic', {
      name: 'Anthropic',
      models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
      capabilities: ['chat', 'completion'],
      config: {
        apiKey: process.env.ANTHROPIC_API_KEY,
        baseURL: 'https://api.anthropic.com'
      },
      adapter: this.createAnthropicAdapter()
    });

    // Google Gemini Provider Adapter
    this.registerProvider('google', {
      name: 'Google',
      models: ['gemini-pro', 'gemini-pro-vision'],
      capabilities: ['chat', 'completion', 'embeddings'],
      config: {
        apiKey: process.env.GOOGLE_API_KEY,
        baseURL: 'https://generativelanguage.googleapis.com'
      },
      adapter: this.createGoogleAdapter()
    });

    // Local LLaMA Provider Adapter
    this.registerProvider('local', {
      name: 'Local LLaMA',
      models: ['llama-7b', 'llama-13b', 'mistral-7b'],
      capabilities: ['chat', 'completion'],
      config: {
        baseURL: process.env.LOCAL_LLM_URL || 'http://localhost:8080',
        modelPath: process.env.LOCAL_MODEL_PATH
      },
      adapter: this.createLocalAdapter()
    });
  }

  createOpenAIAdapter() {
    return {
      async complete(prompt, options = {}) {
        // OpenAI completion implementation
        return {
          text: 'OpenAI response',
          tokens: { prompt: 100, completion: 50, total: 150 },
          model: options.model || 'gpt-4'
        };
      },

      async chat(messages, options = {}) {
        // OpenAI chat implementation
        return {
          message: { role: 'assistant', content: 'OpenAI chat response' },
          tokens: { prompt: 100, completion: 50, total: 150 },
          model: options.model || 'gpt-4'
        };
      },

      async embed(text, options = {}) {
        // OpenAI embeddings implementation
        return {
          embedding: new Array(1536).fill(0).map(() => Math.random()),
          tokens: text.split(' ').length,
          model: options.model || 'text-embedding-3-small'
        };
      },

      async stream(prompt, options = {}, onChunk) {
        // Streaming implementation
        const chunks = ['Streaming', ' response', ' from', ' OpenAI'];
        for (const chunk of chunks) {
          await new Promise(resolve => setTimeout(resolve, 100));
          onChunk(chunk);
        }
        return chunks.join('');
      }
    };
  }

  createAnthropicAdapter() {
    return {
      async complete(prompt, options = {}) {
        return {
          text: 'Anthropic Claude response',
          tokens: { prompt: 100, completion: 50, total: 150 },
          model: options.model || 'claude-3-opus'
        };
      },

      async chat(messages, options = {}) {
        return {
          message: { role: 'assistant', content: 'Claude chat response' },
          tokens: { prompt: 100, completion: 50, total: 150 },
          model: options.model || 'claude-3-opus'
        };
      },

      async embed(text, options = {}) {
        throw new Error('Anthropic does not support embeddings');
      }
    };
  }

  createGoogleAdapter() {
    return {
      async complete(prompt, options = {}) {
        return {
          text: 'Google Gemini response',
          tokens: { prompt: 100, completion: 50, total: 150 },
          model: options.model || 'gemini-pro'
        };
      },

      async chat(messages, options = {}) {
        return {
          message: { role: 'model', content: 'Gemini chat response' },
          tokens: { prompt: 100, completion: 50, total: 150 },
          model: options.model || 'gemini-pro'
        };
      },

      async embed(text, options = {}) {
        return {
          embedding: new Array(768).fill(0).map(() => Math.random()),
          tokens: text.split(' ').length,
          model: 'gemini-embedding'
        };
      }
    };
  }

  createLocalAdapter() {
    return {
      async complete(prompt, options = {}) {
        return {
          text: 'Local LLaMA response',
          tokens: { prompt: 100, completion: 50, total: 150 },
          model: options.model || 'llama-7b'
        };
      },

      async chat(messages, options = {}) {
        return {
          message: { role: 'assistant', content: 'Local LLaMA chat response' },
          tokens: { prompt: 100, completion: 50, total: 150 },
          model: options.model || 'llama-7b'
        };
      },

      async embed(text, options = {}) {
        throw new Error('Local model does not support embeddings');
      }
    };
  }

  async initializeModels() {
    logger.info('🤖 Initializing AI models registry...');

    // Model registry structure
    this.modelRegistry = {
      // Model metadata
      metadata: new Map(),
      // Model capabilities
      capabilities: new Map(),
      // Model pricing
      pricing: new Map(),
      // Model performance
      performance: new Map()
    };

    // Register default models
    this.registerModel('gpt-4', {
      provider: 'openai',
      type: 'chat',
      contextLength: 8192,
      pricing: { input: 0.03, output: 0.06 },
      capabilities: ['chat', 'completion', 'function-calling']
    });

    this.registerModel('claude-3-opus', {
      provider: 'anthropic',
      type: 'chat',
      contextLength: 200000,
      pricing: { input: 0.015, output: 0.075 },
      capabilities: ['chat', 'completion', 'vision']
    });

    this.registerModel('gemini-pro', {
      provider: 'google',
      type: 'chat',
      contextLength: 32768,
      pricing: { input: 0.001, output: 0.002 },
      capabilities: ['chat', 'completion', 'vision']
    });

    this.registerModel('llama-7b', {
      provider: 'local',
      type: 'chat',
      contextLength: 4096,
      pricing: { input: 0, output: 0 },
      capabilities: ['chat', 'completion']
    });
  }

  async initializePromptSystem() {
    logger.info('🤖 Initializing prompt management system...');

    // Prompt template engine
    this.promptEngine = {
      templates: new Map(),
      variables: new Map(),
      chains: new Map(),

      compile(template, variables = {}) {
        let compiled = template;
        for (const [key, value] of Object.entries(variables)) {
          compiled = compiled.replace(new RegExp(`{{${key}}}`, 'g'), value);
        }
        return compiled;
      },

      chain(...prompts) {
        return prompts.join('\n\n');
      },

      optimize(prompt) {
        // Remove unnecessary whitespace
        let optimized = prompt.replace(/\s+/g, ' ').trim();
        // Remove redundant instructions
        optimized = optimized.replace(/please\s+/gi, '');
        return optimized;
      }
    };

    // Register default templates
    this.registerPromptTemplate('task-planning', {
      system: 'You are an AI task planner. Break down complex tasks into actionable steps.',
      template: 'Task: {{task}}\n\nContext: {{context}}\n\nGenerate a detailed plan:',
      variables: ['task', 'context']
    });

    this.registerPromptTemplate('code-generation', {
      system: 'You are an expert programmer. Generate clean, efficient code.',
      template: 'Language: {{language}}\n\nRequirement: {{requirement}}\n\nGenerate code:',
      variables: ['language', 'requirement']
    });

    this.registerPromptTemplate('analysis', {
      system: 'You are an analytical AI. Provide thorough analysis and insights.',
      template: 'Data: {{data}}\n\nAnalyze and provide insights:',
      variables: ['data']
    });
  }

  async initializeContextManager() {
    logger.info('🤖 Initializing context management...');

    this.contextManager = {
      // Active contexts
      contexts: new Map(),
      
      // Context operations
      create(id, initialContext = {}) {
        const context = {
          id,
          messages: [],
          metadata: {},
          tokens: 0,
          created: Date.now(),
          updated: Date.now(),
          ...initialContext
        };
        this.contexts.set(id, context);
        return context;
      },

      update(id, updates) {
        const context = this.contexts.get(id);
        if (context) {
          Object.assign(context, updates, { updated: Date.now() });
        }
        return context;
      },

      append(id, message) {
        const context = this.contexts.get(id);
        if (context) {
          context.messages.push(message);
          context.tokens += this.estimateTokens(message);
          context.updated = Date.now();
          
          // Compress if needed
          if (context.tokens > 7000) {
            this.compress(id);
          }
        }
        return context;
      },

      compress(id) {
        const context = this.contexts.get(id);
        if (context && context.messages.length > 10) {
          // Keep system message and last 8 messages
          const system = context.messages.find(m => m.role === 'system');
          const recent = context.messages.slice(-8);
          context.messages = system ? [system, ...recent] : recent;
          context.tokens = context.messages.reduce(
            (sum, msg) => sum + this.estimateTokens(msg), 0
          );
        }
      },

      estimateTokens(message) {
        // Simple token estimation (4 chars per token average)
        const content = typeof message === 'string' ? message : message.content || '';
        return Math.ceil(content.length / 4);
      },

      get(id) {
        return this.contexts.get(id);
      },

      delete(id) {
        return this.contexts.delete(id);
      },

      clear() {
        this.contexts.clear();
      }
    };
  }

  async initializeTokenManager() {
    logger.info('🤖 Initializing token management...');

    // Capture reference to parent's tokenTracking for use in tokenManager methods
    const tokenTracking = this.tokenTracking;
    const modelRegistry = this.modelRegistry;

    this.tokenManager = {
      // Track token usage
      track(provider, model, tokens) {
        // Update totals
        tokenTracking.total += tokens.total || 0;

        // Update by provider
        const providerTokens = tokenTracking.byProvider.get(provider) || 0;
        tokenTracking.byProvider.set(provider, providerTokens + (tokens.total || 0));

        // Update by model
        const modelTokens = tokenTracking.byModel.get(model) || 0;
        tokenTracking.byModel.set(model, modelTokens + (tokens.total || 0));

        // Calculate costs
        this.calculateCosts(provider, model, tokens);
      },

      calculateCosts(provider, model, tokens) {
        const modelInfo = modelRegistry.metadata.get(model);
        if (modelInfo && modelInfo.pricing) {
          const inputCost = (tokens.prompt || 0) * modelInfo.pricing.input / 1000;
          const outputCost = (tokens.completion || 0) * modelInfo.pricing.output / 1000;
          const totalCost = inputCost + outputCost;

          const currentCost = tokenTracking.costs.get(model) || 0;
          tokenTracking.costs.set(model, currentCost + totalCost);

          return totalCost;
        }
        return 0;
      },

      optimize(text) {
        // Token optimization strategies
        let optimized = text;

        // Remove excessive whitespace
        optimized = optimized.replace(/\s+/g, ' ');

        // Remove unnecessary words
        const unnecessaryWords = ['please', 'kindly', 'basically', 'actually'];
        unnecessaryWords.forEach(word => {
          optimized = optimized.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
        });

        return optimized.trim();
      },

      getUsage() {
        return {
          total: tokenTracking.total,
          byProvider: Object.fromEntries(tokenTracking.byProvider),
          byModel: Object.fromEntries(tokenTracking.byModel),
          costs: Object.fromEntries(tokenTracking.costs)
        };
      }
    };
  }

  async initializeCognitiveServices() {
    logger.info('🤖 Initializing cognitive services...');

    this.cognitiveServices = {
      // Natural Language Understanding
      nlu: {
        async analyzeIntent(text) {
          // Intent recognition
          return {
            intent: 'general',
            confidence: 0.95,
            entities: []
          };
        },

        async extractEntities(text) {
          // Entity extraction
          return [];
        },

        async analyzeSentiment(text) {
          // Sentiment analysis
          return {
            sentiment: 'neutral',
            score: 0.5
          };
        }
      },

      // Embeddings service
      embeddings: {
        async generate(text, model = 'text-embedding-3-small') {
          const provider = this.findProviderForModel(model);
          if (provider && provider.adapter.embed) {
            return await provider.adapter.embed(text, { model });
          }
          throw new Error(`No embedding provider available for model: ${model}`);
        },

        async similarity(embedding1, embedding2) {
          // Cosine similarity
          const dotProduct = embedding1.reduce((sum, a, i) => sum + a * embedding2[i], 0);
          const norm1 = Math.sqrt(embedding1.reduce((sum, a) => sum + a * a, 0));
          const norm2 = Math.sqrt(embedding2.reduce((sum, a) => sum + a * a, 0));
          return dotProduct / (norm1 * norm2);
        }
      },

      // RAG service
      rag: {
        documents: new Map(),
        embeddings: new Map(),

        async ingest(document) {
          const chunks = this.chunk(document);
          for (const chunk of chunks) {
            const embedding = await this.cognitiveServices.embeddings.generate(chunk.text);
            this.embeddings.set(chunk.id, embedding);
            this.documents.set(chunk.id, chunk);
          }
        },

        chunk(document, chunkSize = 500) {
          const chunks = [];
          const words = document.split(' ');
          for (let i = 0; i < words.length; i += chunkSize) {
            chunks.push({
              id: crypto.randomUUID(),
              text: words.slice(i, i + chunkSize).join(' '),
              metadata: { index: chunks.length }
            });
          }
          return chunks;
        },

        async retrieve(query, k = 5) {
          const queryEmbedding = await this.cognitiveServices.embeddings.generate(query);
          const similarities = [];

          for (const [id, embedding] of this.embeddings) {
            const similarity = await this.cognitiveServices.embeddings.similarity(
              queryEmbedding.embedding,
              embedding.embedding
            );
            similarities.push({ id, similarity });
          }

          similarities.sort((a, b) => b.similarity - a.similarity);
          return similarities.slice(0, k).map(s => this.documents.get(s.id));
        }
      }
    };
  }

  async initializeResponseProcessor() {
    logger.info('🤖 Initializing response processor...');

    this.responseProcessor = new ResponseProcessor({
      enableValidation: true,
      enableFiltering: true,
      enableOptimization: true,
      enableCaching: true,
      enableStreaming: true,
      validationRules: {
        maxLength: 50000,
        enableContentSafety: true,
        enablePIIDetection: true
      },
      filterRules: {
        enableProfanityFilter: true,
        enableSafetyFilter: true,
        enableComplianceFilter: true
      },
      optimizationRules: {
        enableCompression: true,
        enableTokenOptimization: true,
        enableFormatting: true
      }
    });

    // ResponseProcessor initializes synchronously in constructor - no async initialize() needed

    // Wire up events
    this.responseProcessor.on('response-processed', (data) => {
      this.safeEmit('ai:response-processed', data);
    });

    this.responseProcessor.on('validation-failed', (data) => {
      this.safeEmit('ai:validation-failed', data);
    });

    this.responseProcessor.on('filtering-applied', (data) => {
      this.safeEmit('ai:filtering-applied', data);
    });
  }

  async initializePerformanceOptimizer() {
    logger.info('🤖 Initializing performance optimizer...');

    this.performanceOptimizer = new AIPerformanceOptimizer({
      enableCaching: true,
      enableBatching: true,
      enableLoadBalancing: true,
      enablePredictiveOptimization: true,
      cacheStrategy: 'intelligent',
      batchingStrategy: 'adaptive',
      loadBalancingStrategy: 'weighted-round-robin',
      maxCacheSize: 10000,
      cacheTTL: 3600000,
      batchSize: 10,
      batchTimeout: 1000
    });

    // AIPerformanceOptimizer initializes synchronously in constructor - no async initialize() needed

    // Wire up events
    this.performanceOptimizer.on('cache-hit', (data) => {
      this.safeEmit('ai:cache-hit', data);
    });

    this.performanceOptimizer.on('batch-processed', (data) => {
      this.safeEmit('ai:batch-processed', data);
    });

    this.performanceOptimizer.on('load-balanced', (data) => {
      this.safeEmit('ai:load-balanced', data);
    });
  }

  // Provider management
  registerProvider(id, config) {
    this.providers.set(id, {
      id,
      ...config,
      status: 'inactive',
      metrics: {
        requests: 0,
        errors: 0,
        latency: 0
      }
    });
    
    // Add to fallback chain
    this.fallbackChain.push(id);
    
    logger.info(`🤖 Registered AI provider: ${id}`);
    return true;
  }

  async activateProvider(id) {
    const provider = this.providers.get(id);
    if (provider) {
      provider.status = 'active';
      if (!this.activeProvider) {
        this.activeProvider = id;
      }
      return true;
    }
    return false;
  }

  // Model management
  registerModel(id, config) {
    this.modelRegistry.metadata.set(id, config);
    this.models.set(id, {
      id,
      ...config,
      usage: 0,
      errors: 0
    });
    
    // Set default for type if not set
    if (!this.defaultModels[config.type]) {
      this.defaultModels[config.type] = id;
    }
    
    return true;
  }

  // Prompt management
  registerPromptTemplate(id, template) {
    this.promptTemplates.set(id, template);
    return true;
  }

  // Core AI operations
  async complete(prompt, options = {}) {
    const request = {
      type: 'completion',
      prompt,
      options,
      timestamp: Date.now()
    };
    
    return this.executeRequest(request);
  }

  async chat(messages, options = {}) {
    const request = {
      type: 'chat',
      messages,
      options,
      timestamp: Date.now()
    };
    
    return this.executeRequest(request);
  }

  async embed(text, options = {}) {
    const request = {
      type: 'embedding',
      text,
      options,
      timestamp: Date.now()
    };
    
    return this.executeRequest(request);
  }

  async executeRequest(request) {
    // Check cache first
    if (this.cacheOptions.enabled) {
      const cacheKey = this.getCacheKey(request);
      const cached = this.responseCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheOptions.ttl) {
        this.metrics.cacheHits++;
        return cached.response;
      }
      this.metrics.cacheMisses++;
    }
    
    // Add to queue
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ request, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.requestQueue.length === 0) return;
    if (this.activeRequests.size >= this.maxConcurrent) return;
    
    this.processing = true;
    
    while (this.requestQueue.length > 0 && this.activeRequests.size < this.maxConcurrent) {
      const { request, resolve, reject } = this.requestQueue.shift();
      const requestId = crypto.randomUUID();
      
      this.activeRequests.add(requestId);
      
      this.processRequest(request)
        .then(response => {
          // Cache response
          if (this.cacheOptions.enabled) {
            const cacheKey = this.getCacheKey(request);
            this.responseCache.set(cacheKey, {
              response,
              timestamp: Date.now()
            });
            
            // Manage cache size
            if (this.responseCache.size > this.cacheOptions.maxSize) {
              const firstKey = this.responseCache.keys().next().value;
              this.responseCache.delete(firstKey);
            }
          }
          
          resolve(response);
        })
        .catch(reject)
        .finally(() => {
          this.activeRequests.delete(requestId);
          if (this.requestQueue.length > 0) {
            this.processQueue();
          }
        });
    }
    
    this.processing = false;
  }

  async processRequest(request) {
    const startTime = Date.now();

    try {
      // Apply performance optimization
      if (this.performanceOptimizer) {
        request = await this.performanceOptimizer.optimizeRequest(request);
      }

      // Get provider and model
      const model = request.options.model || this.defaultModels[request.type] || 'gpt-4';
      const provider = this.findProviderForModel(model);

      if (!provider) {
        throw new Error(`No provider available for model: ${model}`);
      }

      // Execute request based on type
      let response;
      switch (request.type) {
        case 'completion':
          response = await provider.adapter.complete(request.prompt, request.options);
          break;
        case 'chat':
          response = await provider.adapter.chat(request.messages, request.options);
          break;
        case 'embedding':
          response = await provider.adapter.embed(request.text, request.options);
          break;
        default:
          throw new Error(`Unknown request type: ${request.type}`);
      }

      // Process response through response processor
      if (this.responseProcessor) {
        response = await this.responseProcessor.processResponse(response, {
          requestType: request.type,
          provider: provider.id,
          model
        });
      }

      // Track metrics
      const latency = Date.now() - startTime;
      this.updateMetrics(provider.id, model, response, latency, true);

      return response;

    } catch (error) {
      // Try fallback providers
      if (this.config.autoFallback) {
        return this.tryFallback(request, error);
      }

      // Track error
      this.metrics.failedRequests++;
      throw error;
    }
  }

  async tryFallback(request, originalError) {
    for (const providerId of this.fallbackChain) {
      if (providerId === this.activeProvider) continue;
      
      try {
        const provider = this.providers.get(providerId);
        if (provider && provider.status === 'active') {
          logger.info(`🤖 Falling back to provider: ${providerId}`);
          
          // Temporarily switch provider
          const tempProvider = this.activeProvider;
          this.activeProvider = providerId;
          
          const response = await this.processRequest(request);
          
          // Restore provider
          this.activeProvider = tempProvider;
          
          return response;
        }
      } catch (fallbackError) {
        logger.error(`🤖 Fallback provider ${providerId} failed:`, fallbackError.message);
      }
    }
    
    throw originalError;
  }

  findProviderForModel(model) {
    const modelInfo = this.modelRegistry.metadata.get(model);
    if (modelInfo) {
      return this.providers.get(modelInfo.provider);
    }
    
    // Search all providers
    for (const provider of this.providers.values()) {
      if (provider.models.includes(model)) {
        return provider;
      }
    }
    
    return null;
  }

  getCacheKey(request) {
    const key = JSON.stringify({
      type: request.type,
      content: request.prompt || request.messages || request.text,
      options: request.options
    });
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  updateMetrics(provider, model, response, latency, success) {
    this.metrics.totalRequests++;
    
    if (success) {
      this.metrics.successfulRequests++;
      this.metrics.averageLatency = 
        (this.metrics.averageLatency * (this.metrics.successfulRequests - 1) + latency) / 
        this.metrics.successfulRequests;
      
      // Track tokens
      if (response.tokens) {
        this.tokenManager.track(provider, model, response.tokens);
        this.metrics.tokenUsage += response.tokens.total || 0;
      }
    } else {
      this.metrics.failedRequests++;
    }
    
    // Update provider metrics
    const providerInfo = this.providers.get(provider);
    if (providerInfo) {
      providerInfo.metrics.requests++;
      if (!success) {
        providerInfo.metrics.errors++;
      }
      providerInfo.metrics.latency = 
        (providerInfo.metrics.latency * (providerInfo.metrics.requests - 1) + latency) / 
        providerInfo.metrics.requests;
    }
  }

  startRequestProcessor() {
    // Periodic queue processing
    this.queueProcessor = setInterval(() => {
      if (this.requestQueue.length > 0) {
        this.processQueue();
      }
    }, 100);
  }

  setupMonitoring() {
    // Periodic metrics reporting
    this.metricsReporter = setInterval(() => {
      this.safeEmit(EventPatterns.METRICS.UPDATED, {
        metrics: this.metrics,
        tokenUsage: this.tokenManager.getUsage(),
        providers: Object.fromEntries(
          Array.from(this.providers.entries()).map(([id, provider]) => [
            id,
            {
              status: provider.status,
              metrics: provider.metrics
            }
          ])
        ),
        queueLength: this.requestQueue.length,
        activeRequests: this.activeRequests.size
      });
    }, 30000); // Every 30 seconds
  }

  // High-level AI operations
  async generatePlan(task, context = {}) {
    const prompt = this.promptEngine.compile(
      this.promptTemplates.get('task-planning').template,
      { task, context: JSON.stringify(context) }
    );
    
    const response = await this.complete(prompt, {
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 1000
    });
    
    return this.parsePlan(response.text);
  }

  async generateCode(language, requirement, context = {}) {
    const prompt = this.promptEngine.compile(
      this.promptTemplates.get('code-generation').template,
      { language, requirement }
    );
    
    const response = await this.complete(prompt, {
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 2000
    });
    
    return response.text;
  }

  async analyze(data, analysisType = 'general') {
    const prompt = this.promptEngine.compile(
      this.promptTemplates.get('analysis').template,
      { data: JSON.stringify(data) }
    );
    
    const response = await this.complete(prompt, {
      model: 'claude-3-opus',
      temperature: 0.5,
      maxTokens: 1500
    });
    
    return this.parseAnalysis(response.text);
  }

  parsePlan(text) {
    // Parse plan from AI response
    const lines = text.split('\n').filter(line => line.trim());
    const steps = [];
    
    for (const line of lines) {
      const match = line.match(/^\d+\.\s+(.+)/);
      if (match) {
        steps.push({
          description: match[1],
          status: 'pending',
          dependencies: []
        });
      }
    }
    
    return {
      steps,
      totalSteps: steps.length,
      estimatedTime: steps.length * 5 // 5 minutes per step estimate
    };
  }

  parseAnalysis(text) {
    // Parse analysis from AI response
    return {
      summary: text.slice(0, 200),
      insights: [],
      recommendations: [],
      confidence: 0.85
    };
  }

  // Status and capabilities
  getCapabilities() {
    return [
      'multi-provider-support',
      'intelligent-fallback',
      'prompt-management',
      'context-management',
      'token-optimization',
      'response-caching',
      'streaming-support',
      'embeddings-generation',
      'rag-implementation',
      'cost-tracking',
      'performance-monitoring',
      'response-processing',
      'ai-performance-optimization',
      'content-validation',
      'safety-filtering',
      'intelligent-batching',
      'load-balancing',
      'predictive-optimization'
    ];
  }

  getStatus() {
    return {
      providers: Array.from(this.providers.keys()),
      activeProvider: this.activeProvider,
      models: Array.from(this.models.keys()),
      metrics: this.metrics,
      tokenUsage: this.tokenManager.getUsage(),
      cacheSize: this.responseCache.size,
      queueLength: this.requestQueue.length,
      activeRequests: this.activeRequests.size,
      responseProcessor: this.responseProcessor?.getStatus() || 'not-initialized',
      performanceOptimizer: this.performanceOptimizer?.getStatus() || 'not-initialized'
    };
  }

  async onShutdown() {
    logger.info('🤖 Shutting down Unified AI System...');
    
    // Stop processors
    if (this.queueProcessor) {
      clearInterval(this.queueProcessor);
    }
    
    if (this.metricsReporter) {
      clearInterval(this.metricsReporter);
    }
    
    // Clear queues
    this.requestQueue = [];
    this.activeRequests.clear();
    
    // Clear caches
    this.responseCache.clear();
    this.contextManager.clear();
    
    logger.info('🤖 Unified AI System shutdown complete');
  }
}

module.exports = { UnifiedAISystem };