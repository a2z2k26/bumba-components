/**
 * Model Capabilities Registry for BUMBA AI Providers
 * Sprint 2.11: Comprehensive model database with capabilities and selection helpers
 *
 * Provides:
 * - Model database with capabilities and specifications
 * - Capability matrix (vision, tools, context length, etc.)
 * - Performance benchmarks and metrics
 * - Cost comparison and optimization
 * - Smart model selection based on requirements
 */

const EventEmitter = require('events');

/**
 * Model capabilities
 */
const ModelCapability = {
  TEXT: 'text',                       // Text generation
  VISION: 'vision',                   // Image understanding
  FUNCTION_CALLING: 'function_calling', // Tool/function calling
  JSON_MODE: 'json_mode',             // Structured JSON output
  STREAMING: 'streaming',             // Token streaming
  EMBEDDINGS: 'embeddings',           // Text embeddings
  CODE: 'code',                       // Code generation/understanding
  CHAT: 'chat',                       // Chat/conversation
  COMPLETION: 'completion',           // Text completion
  SYSTEM_MESSAGE: 'system_message'    // System message support
};

/**
 * Model performance tier
 */
const PerformanceTier = {
  FAST: 'fast',           // < 1s response time
  MEDIUM: 'medium',       // 1-3s response time
  SLOW: 'slow'           // > 3s response time
};

/**
 * Model cost tier
 */
const CostTier = {
  VERY_LOW: 'very_low',   // < $0.50 per 1M tokens
  LOW: 'low',             // $0.50 - $2 per 1M tokens
  MEDIUM: 'medium',       // $2 - $10 per 1M tokens
  HIGH: 'high',           // $10 - $30 per 1M tokens
  VERY_HIGH: 'very_high'  // > $30 per 1M tokens
};

/**
 * Model specification
 *
 * @typedef {Object} ModelSpec
 * @property {string} id - Unique model identifier
 * @property {string} name - Human-readable model name
 * @property {string} provider - Provider name (openai, anthropic, google, openrouter)
 * @property {string[]} capabilities - Array of ModelCapability values
 * @property {number} contextWindow - Maximum context length in tokens
 * @property {number} maxOutputTokens - Maximum output tokens
 * @property {Object} pricing - Pricing information
 * @property {number} pricing.input - Cost per 1M input tokens
 * @property {number} pricing.output - Cost per 1M output tokens
 * @property {Object} [freeTier] - Optional free tier information
 * @property {number} [freeTier.requestsPerMinute] - RPM limit for free tier
 * @property {number} [freeTier.tokensPerMinute] - TPM limit for free tier
 * @property {number} [freeTier.requestsPerDay] - RPD limit for free tier
 * @property {string} [freeTier.resetTime] - When limits reset (e.g., '00:00 PT')
 * @property {boolean} [freeTier.commercialUse] - Whether commercial use allowed on free tier
 * @property {string} performanceTier - PerformanceTier value
 * @property {string} costTier - CostTier value
 * @property {string} releaseDate - Release date (YYYY-MM-DD)
 * @property {boolean} recommended - Whether model is recommended for general use
 * @property {string} description - Model description
 */

/**
 * Model capabilities registry
 *
 * @class ModelRegistry
 * @extends EventEmitter
 * @description Comprehensive database of AI models with capabilities and specifications
 */
class ModelRegistry extends EventEmitter {
  constructor() {
    super();

    this.models = new Map();
    this.lastUpdate = null;

    // Initialize with known models
    this.initializeModels();
  }

  /**
   * Initialize model database
   */
  initializeModels() {
    // OpenAI Models
    this.registerModel({
      id: 'gpt-5',
      name: 'GPT-5',
      provider: 'openai',
      capabilities: [
        ModelCapability.TEXT,
        ModelCapability.VISION,
        ModelCapability.CHAT,
        ModelCapability.FUNCTION_CALLING,
        ModelCapability.JSON_MODE,
        ModelCapability.STREAMING,
        ModelCapability.CODE,
        ModelCapability.SYSTEM_MESSAGE
      ],
      contextWindow: 400000,
      maxOutputTokens: 128000,
      pricing: { input: 1.25, output: 10 },
      performanceTier: PerformanceTier.SLOW,
      costTier: CostTier.HIGH,
      releaseDate: '2025-08-07',
      recommended: true,
      description: 'Latest-generation model with advanced reasoning capabilities'
    });

    this.registerModel({
      id: 'o4-mini',
      name: 'o4-mini',
      provider: 'openai',
      capabilities: [
        ModelCapability.TEXT,
        ModelCapability.VISION,
        ModelCapability.CHAT,
        ModelCapability.STREAMING,
        ModelCapability.CODE,
        ModelCapability.SYSTEM_MESSAGE
      ],
      contextWindow: 200000,
      maxOutputTokens: 16384,
      pricing: { input: 0.60, output: 2.40 },
      performanceTier: PerformanceTier.FAST,
      costTier: CostTier.LOW,
      releaseDate: '2025-01-01',
      recommended: true,
      description: 'Fast, cost-efficient reasoning model optimized for math, coding, and visual tasks'
    });

    this.registerModel({
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      provider: 'openai',
      capabilities: [
        ModelCapability.TEXT,
        ModelCapability.VISION,
        ModelCapability.CHAT,
        ModelCapability.FUNCTION_CALLING,
        ModelCapability.JSON_MODE,
        ModelCapability.STREAMING,
        ModelCapability.CODE,
        ModelCapability.SYSTEM_MESSAGE
      ],
      contextWindow: 128000,
      maxOutputTokens: 4096,
      pricing: { input: 10, output: 30 },
      performanceTier: PerformanceTier.MEDIUM,
      costTier: CostTier.HIGH,
      releaseDate: '2024-01-25',
      recommended: true,
      description: 'GPT-4 with vision, larger context, and better performance'
    });

    this.registerModel({
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      capabilities: [
        ModelCapability.TEXT,
        ModelCapability.VISION,
        ModelCapability.CHAT,
        ModelCapability.FUNCTION_CALLING,
        ModelCapability.JSON_MODE,
        ModelCapability.STREAMING,
        ModelCapability.CODE,
        ModelCapability.SYSTEM_MESSAGE
      ],
      contextWindow: 128000,
      maxOutputTokens: 4096,
      pricing: { input: 5, output: 15 },
      performanceTier: PerformanceTier.FAST,
      costTier: CostTier.MEDIUM,
      releaseDate: '2024-05-13',
      recommended: true,
      description: 'Fastest and most affordable flagship model'
    });

    this.registerModel({
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      provider: 'openai',
      capabilities: [
        ModelCapability.TEXT,
        ModelCapability.VISION,
        ModelCapability.CHAT,
        ModelCapability.FUNCTION_CALLING,
        ModelCapability.JSON_MODE,
        ModelCapability.STREAMING,
        ModelCapability.CODE,
        ModelCapability.SYSTEM_MESSAGE
      ],
      contextWindow: 128000,
      maxOutputTokens: 16384,
      pricing: { input: 0.15, output: 0.6 },
      performanceTier: PerformanceTier.FAST,
      costTier: CostTier.VERY_LOW,
      releaseDate: '2024-07-18',
      recommended: true,
      description: 'Affordable small model for fast, lightweight tasks'
    });

    this.registerModel({
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      provider: 'openai',
      capabilities: [
        ModelCapability.TEXT,
        ModelCapability.CHAT,
        ModelCapability.FUNCTION_CALLING,
        ModelCapability.JSON_MODE,
        ModelCapability.STREAMING,
        ModelCapability.CODE,
        ModelCapability.SYSTEM_MESSAGE
      ],
      contextWindow: 16385,
      maxOutputTokens: 4096,
      pricing: { input: 0.5, output: 1.5 },
      performanceTier: PerformanceTier.FAST,
      costTier: CostTier.VERY_LOW,
      releaseDate: '2023-03-01',
      recommended: false,
      description: 'Fast, inexpensive model for simple tasks'
    });

    // Anthropic Claude Models
    this.registerModel({
      id: 'claude-opus-4-1',
      name: 'Claude Opus 4.1',
      provider: 'anthropic',
      capabilities: [
        ModelCapability.TEXT,
        ModelCapability.VISION,
        ModelCapability.CHAT,
        ModelCapability.FUNCTION_CALLING,
        ModelCapability.STREAMING,
        ModelCapability.CODE,
        ModelCapability.SYSTEM_MESSAGE
      ],
      contextWindow: 200000,
      maxOutputTokens: 32000,
      pricing: { input: 15, output: 75 },
      performanceTier: PerformanceTier.SLOW,
      costTier: CostTier.VERY_HIGH,
      releaseDate: '2025-08-05',
      recommended: true,
      description: 'Most capable Claude model for agentic tasks, real-world coding, and advanced reasoning'
    });

    this.registerModel({
      id: 'claude-sonnet-4-5-20250929',
      name: 'Claude Sonnet 4.5',
      provider: 'anthropic',
      capabilities: [
        ModelCapability.TEXT,
        ModelCapability.VISION,
        ModelCapability.CHAT,
        ModelCapability.FUNCTION_CALLING,
        ModelCapability.STREAMING,
        ModelCapability.CODE,
        ModelCapability.SYSTEM_MESSAGE
      ],
      contextWindow: 200000,
      maxOutputTokens: 8192,
      pricing: { input: 3, output: 15 },
      performanceTier: PerformanceTier.MEDIUM,
      costTier: CostTier.MEDIUM,
      releaseDate: '2025-09-29',
      recommended: true,
      description: 'Best balance of intelligence, speed, and cost with excellent coding performance'
    });

    this.registerModel({
      id: 'claude-haiku-4',
      name: 'Claude Haiku 4',
      provider: 'anthropic',
      capabilities: [
        ModelCapability.TEXT,
        ModelCapability.CHAT,
        ModelCapability.FUNCTION_CALLING,
        ModelCapability.STREAMING,
        ModelCapability.CODE,
        ModelCapability.SYSTEM_MESSAGE
      ],
      contextWindow: 200000,
      maxOutputTokens: 8192,
      pricing: { input: 0.80, output: 4 },
      performanceTier: PerformanceTier.FAST,
      costTier: CostTier.LOW,
      releaseDate: '2025-08-01',
      recommended: true,
      description: 'Fastest Claude model for quick, cost-effective tasks'
    });

    // Google Gemini Models
    this.registerModel({
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      provider: 'google',
      capabilities: [
        ModelCapability.TEXT,
        ModelCapability.VISION,
        ModelCapability.CHAT,
        ModelCapability.FUNCTION_CALLING,
        ModelCapability.JSON_MODE,
        ModelCapability.STREAMING,
        ModelCapability.CODE,
        ModelCapability.SYSTEM_MESSAGE
      ],
      contextWindow: 1000000,
      maxOutputTokens: 8192,
      pricing: { input: 1.25, output: 10 },
      freeTier: {
        requestsPerMinute: 5,
        tokensPerMinute: 250000,
        requestsPerDay: 100,
        resetTime: '00:00 PT',
        commercialUse: true
      },
      performanceTier: PerformanceTier.MEDIUM,
      costTier: CostTier.HIGH,
      releaseDate: '2025-06-17',
      recommended: true,
      description: 'Most advanced Gemini model with thinking built in, strong reasoning and coding capabilities'
    });

    this.registerModel({
      id: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      provider: 'google',
      capabilities: [
        ModelCapability.TEXT,
        ModelCapability.VISION,
        ModelCapability.CHAT,
        ModelCapability.FUNCTION_CALLING,
        ModelCapability.JSON_MODE,
        ModelCapability.STREAMING,
        ModelCapability.CODE,
        ModelCapability.SYSTEM_MESSAGE
      ],
      contextWindow: 1000000,
      maxOutputTokens: 8192,
      pricing: { input: 0.075, output: 0.3 },
      freeTier: {
        requestsPerMinute: 15,
        tokensPerMinute: 1000000,
        requestsPerDay: 1500,
        resetTime: '00:00 PT',
        commercialUse: true
      },
      performanceTier: PerformanceTier.FAST,
      costTier: CostTier.VERY_LOW,
      releaseDate: '2024-12-11',
      recommended: true,
      description: 'Fast and affordable with massive context window'
    });

    // OpenRouter Models
    this.registerModel({
      id: 'deepseek/deepseek-r1',
      name: 'DeepSeek R1',
      provider: 'openrouter',
      capabilities: [
        ModelCapability.TEXT,
        ModelCapability.CHAT,
        ModelCapability.STREAMING,
        ModelCapability.CODE,
        ModelCapability.SYSTEM_MESSAGE
      ],
      contextWindow: 131000,
      maxOutputTokens: 8192,
      pricing: { input: 0.55, output: 2.19 },
      performanceTier: PerformanceTier.MEDIUM,
      costTier: CostTier.LOW,
      releaseDate: '2025-01-20',
      recommended: true,
      description: 'Latest DeepSeek reasoning model with excellent coding capabilities'
    });

    this.registerModel({
      id: 'qwen/qwen3-max',
      name: 'Qwen 3 Max',
      provider: 'openrouter',
      capabilities: [
        ModelCapability.TEXT,
        ModelCapability.CHAT,
        ModelCapability.FUNCTION_CALLING,
        ModelCapability.STREAMING,
        ModelCapability.CODE,
        ModelCapability.SYSTEM_MESSAGE
      ],
      contextWindow: 256000,
      maxOutputTokens: 8192,
      pricing: { input: 1.20, output: 6.00 },
      performanceTier: PerformanceTier.MEDIUM,
      costTier: CostTier.MEDIUM,
      releaseDate: '2025-03-01',
      recommended: true,
      description: 'Advanced Qwen model with major improvements in reasoning and multilingual support'
    });

    this.registerModel({
      id: 'moonshotai/kimi-k2',
      name: 'Kimi K2',
      provider: 'openrouter',
      capabilities: [
        ModelCapability.TEXT,
        ModelCapability.CHAT,
        ModelCapability.FUNCTION_CALLING,
        ModelCapability.STREAMING,
        ModelCapability.CODE,
        ModelCapability.SYSTEM_MESSAGE
      ],
      contextWindow: 128000,
      maxOutputTokens: 4096,
      pricing: { input: 0.15, output: 2.50 },
      performanceTier: PerformanceTier.MEDIUM,
      costTier: CostTier.LOW,
      releaseDate: '2025-07-11',
      recommended: true,
      description: 'MoE model optimized for agentic capabilities, advanced tool use, reasoning, and code synthesis'
    });

    // Local Docker Models
    // Note: Local models have no API pricing (free after hardware costs)
    // Users can register custom local models using registerModel()
    // Example:
    // this.registerModel({
    //   id: 'local/llama-3-70b',
    //   name: 'Llama 3 70B (Local)',
    //   provider: 'local',
    //   capabilities: [ModelCapability.TEXT, ModelCapability.CHAT, ModelCapability.CODE],
    //   contextWindow: 8192,
    //   maxOutputTokens: 4096,
    //   pricing: { input: 0, output: 0 }, // No API costs for local models
    //   performanceTier: PerformanceTier.MEDIUM,
    //   costTier: CostTier.VERY_LOW,
    //   releaseDate: '2024-04-18',
    //   recommended: false,
    //   description: 'Locally hosted Llama 3 70B model running in Docker'
    // });

    this.lastUpdate = new Date().toISOString();
    this.emit('registry:initialized', { modelCount: this.models.size });
  }

  /**
   * Register a new model
   * @param {ModelSpec} spec - Model specification object
   */
  registerModel(spec) {
    this.models.set(spec.id, spec);
    this.emit('model:registered', { id: spec.id });
  }

  /**
   * Update an existing model
   * @param {string} id - Model ID to update
   * @param {Object} updates - Properties to update
   * @returns {boolean} - True if model was updated, false if not found
   */
  updateModel(id, updates) {
    const model = this.models.get(id);
    if (!model) {
      return false;
    }

    Object.assign(model, updates);
    this.emit('model:updated', { id });
    return true;
  }

  /**
   * Remove a model
   * @param {string} id - Model ID to remove
   * @returns {boolean} - True if model was removed, false if not found
   */
  removeModel(id) {
    const deleted = this.models.delete(id);
    if (deleted) {
      this.emit('model:removed', { id });
    }
    return deleted;
  }

  /**
   * Check if model exists
   * @param {string} id - Model ID to check
   * @returns {boolean} - True if model exists
   */
  hasModel(id) {
    return this.models.has(id);
  }

  /**
   * Get model by ID
   * @param {string} id - Model ID
   * @returns {ModelSpec|null} - Model specification or null if not found
   */
  getModel(id) {
    return this.models.get(id) || null;
  }

  /**
   * Get all models
   * @returns {ModelSpec[]} - Array of all model specifications
   */
  getAllModels() {
    return Array.from(this.models.values());
  }

  /**
   * Get models by provider
   * @param {string} provider - Provider name (openai, anthropic, google)
   * @returns {ModelSpec[]} - Array of matching models
   */
  getModelsByProvider(provider) {
    return this.getAllModels().filter(m => m.provider === provider);
  }

  /**
   * Get models by capability
   * @param {string} capability - Capability to filter by (from ModelCapability enum)
   * @returns {ModelSpec[]} - Array of matching models
   */
  getModelsByCapability(capability) {
    return this.getAllModels().filter(m => m.capabilities.includes(capability));
  }

  /**
   * Get recommended models
   * @returns {ModelSpec[]} - Array of recommended models
   */
  getRecommendedModels() {
    return this.getAllModels().filter(m => m.recommended);
  }

  /**
   * Search models
   * @param {string} query - Search query string
   * @returns {ModelSpec[]} - Array of matching models
   */
  searchModels(query) {
    const queryLower = query.toLowerCase();
    return this.getAllModels().filter(m =>
      m.id.toLowerCase().includes(queryLower) ||
      m.name.toLowerCase().includes(queryLower) ||
      m.description.toLowerCase().includes(queryLower)
    );
  }

  /**
   * Get models matching requirements
   * @param {Object} requirements - Model requirements
   * @param {string} [requirements.provider] - Filter by provider
   * @param {string|string[]} [requirements.capabilities] - Required capabilities
   * @param {number} [requirements.minContextWindow] - Minimum context window size
   * @param {string} [requirements.maxCostTier] - Maximum cost tier
   * @param {string} [requirements.minPerformanceTier] - Minimum performance tier
   * @param {boolean} [requirements.recommendedOnly] - Only recommended models
   * @returns {ModelSpec[]} - Array of matching models
   */
  findModels(requirements = {}) {
    let results = this.getAllModels();

    // Filter by provider
    if (requirements.provider) {
      results = results.filter(m => m.provider === requirements.provider);
    }

    // Filter by capabilities
    if (requirements.capabilities) {
      const requiredCaps = Array.isArray(requirements.capabilities)
        ? requirements.capabilities
        : [requirements.capabilities];

      results = results.filter(m =>
        requiredCaps.every(cap => m.capabilities.includes(cap))
      );
    }

    // Filter by context window
    if (requirements.minContextWindow) {
      results = results.filter(m => m.contextWindow >= requirements.minContextWindow);
    }

    // Filter by cost tier
    if (requirements.maxCostTier) {
      const tierOrder = ['very_low', 'low', 'medium', 'high', 'very_high'];
      const maxIndex = tierOrder.indexOf(requirements.maxCostTier);
      results = results.filter(m => tierOrder.indexOf(m.costTier) <= maxIndex);
    }

    // Filter by performance tier
    if (requirements.minPerformanceTier) {
      const tierOrder = ['slow', 'medium', 'fast'];
      const minIndex = tierOrder.indexOf(requirements.minPerformanceTier);
      results = results.filter(m => tierOrder.indexOf(m.performanceTier) >= minIndex);
    }

    // Filter by recommended
    if (requirements.recommendedOnly) {
      results = results.filter(m => m.recommended);
    }

    return results;
  }

  /**
   * Get best model for requirements
   * @param {Object} requirements - Model requirements (same as findModels)
   * @param {string} [requirements.optimizeFor] - Optimization strategy: cost, performance, balanced, quality
   * @returns {ModelSpec|null} - Best matching model or null if no matches
   */
  getBestModel(requirements = {}) {
    const candidates = this.findModels(requirements);

    if (candidates.length === 0) {
      return null;
    }

    // Score models based on optimization preference
    const optimization = requirements.optimizeFor || 'balanced';

    const scoredCandidates = candidates.map(model => {
      let score = 0;

      // Cost optimization
      if (optimization === 'cost') {
        const costTiers = { very_low: 5, low: 4, medium: 3, high: 2, very_high: 1 };
        score += (costTiers[model.costTier] || 0) * 2;
      }

      // Performance optimization
      if (optimization === 'performance') {
        const perfTiers = { fast: 5, medium: 3, slow: 1 };
        score += (perfTiers[model.performanceTier] || 0) * 2;
      }

      // Balanced optimization
      if (optimization === 'balanced') {
        const costTiers = { very_low: 5, low: 4, medium: 3, high: 2, very_high: 1 };
        const perfTiers = { fast: 5, medium: 3, slow: 1 };
        score += costTiers[model.costTier] || 0;
        score += perfTiers[model.performanceTier] || 0;
      }

      // Quality optimization
      if (optimization === 'quality') {
        const costTiers = { very_high: 5, high: 4, medium: 3, low: 2, very_low: 1 };
        score += costTiers[model.costTier] || 0;
      }

      // Bonus for recommended models
      if (model.recommended) {
        score += 1;
      }

      // Bonus for larger context windows
      if (model.contextWindow >= 100000) {
        score += 1;
      }

      return { model, score };
    });

    // Sort by score (highest first)
    scoredCandidates.sort((a, b) => b.score - a.score);

    return scoredCandidates[0].model;
  }

  /**
   * Compare models
   * @param {string[]} modelIds - Array of model IDs to compare
   * @returns {Object|null} - Comparison object or null if no valid models
   */
  compareModels(modelIds) {
    const models = modelIds.map(id => this.getModel(id)).filter(Boolean);

    if (models.length === 0) {
      return null;
    }

    const comparison = {
      models: models.map(m => ({
        id: m.id,
        name: m.name,
        provider: m.provider
      })),
      capabilities: {},
      specs: {
        contextWindow: models.map(m => ({ id: m.id, value: m.contextWindow })),
        maxOutputTokens: models.map(m => ({ id: m.id, value: m.maxOutputTokens }))
      },
      pricing: {
        input: models.map(m => ({ id: m.id, value: m.pricing.input })),
        output: models.map(m => ({ id: m.id, value: m.pricing.output })),
        averageCost: models.map(m => ({
          id: m.id,
          value: (m.pricing.input + m.pricing.output) / 2
        }))
      },
      performance: models.map(m => ({ id: m.id, tier: m.performanceTier })),
      cost: models.map(m => ({ id: m.id, tier: m.costTier })),
      recommended: models.map(m => ({ id: m.id, value: m.recommended }))
    };

    // Build capability matrix
    const allCapabilities = new Set();
    models.forEach(m => m.capabilities.forEach(cap => allCapabilities.add(cap)));

    for (const capability of allCapabilities) {
      comparison.capabilities[capability] = models.map(m => ({
        id: m.id,
        supported: m.capabilities.includes(capability)
      }));
    }

    return comparison;
  }

  /**
   * Get capability matrix
   * @returns {Array} - Array of models with capability support flags
   */
  getCapabilityMatrix() {
    const allModels = this.getAllModels();
    const allCapabilities = Object.values(ModelCapability);

    return allModels.map(model => {
      const capabilities = {};
      for (const cap of allCapabilities) {
        capabilities[cap] = model.capabilities.includes(cap);
      }

      return {
        model: {
          id: model.id,
          name: model.name,
          provider: model.provider
        },
        capabilities
      };
    });
  }

  /**
   * Estimate cost for model
   * @param {string} modelId - Model ID
   * @param {number} inputTokens - Number of input tokens
   * @param {number} outputTokens - Number of output tokens
   * @returns {Object|null} - Cost estimate or null if model not found
   */
  estimateCost(modelId, inputTokens, outputTokens) {
    const model = this.getModel(modelId);
    if (!model) {
      return null;
    }

    const inputCost = (inputTokens * model.pricing.input) / 1000000;
    const outputCost = (outputTokens * model.pricing.output) / 1000000;
    const totalCost = inputCost + outputCost;

    return {
      model: {
        id: model.id,
        name: model.name
      },
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputCost,
      outputCost,
      totalCost,
      costTier: model.costTier
    };
  }

  /**
   * Compare costs across models
   * @param {string[]} modelIds - Array of model IDs to compare
   * @param {number} inputTokens - Number of input tokens
   * @param {number} outputTokens - Number of output tokens
   * @returns {Object} - Cost comparison with estimates and cheapest model
   */
  compareCosts(modelIds, inputTokens, outputTokens) {
    const estimates = modelIds
      .map(id => this.estimateCost(id, inputTokens, outputTokens))
      .filter(Boolean);

    if (estimates.length === 0) {
      return {
        estimates: [],
        cheapest: null
      };
    }

    estimates.sort((a, b) => a.totalCost - b.totalCost);

    const cheapest = estimates[0];
    const mostExpensive = estimates[estimates.length - 1];
    const savings = mostExpensive.totalCost - cheapest.totalCost;

    return {
      estimates,
      cheapest: {
        model: cheapest.model,
        cost: cheapest.totalCost,
        savings: savings > 0 ? savings : 0,
        savingsPercent: mostExpensive.totalCost > 0
          ? ((savings / mostExpensive.totalCost) * 100).toFixed(1)
          : 0
      }
    };
  }

  /**
   * Get statistics
   * @returns {Object} - Registry statistics including model counts by various dimensions
   */
  getStatistics() {
    const models = this.getAllModels();

    const byProvider = {};
    const byPerformanceTier = {};
    const byCostTier = {};
    const byCapability = {};

    for (const model of models) {
      // By provider
      byProvider[model.provider] = (byProvider[model.provider] || 0) + 1;

      // By performance tier
      byPerformanceTier[model.performanceTier] =
        (byPerformanceTier[model.performanceTier] || 0) + 1;

      // By cost tier
      byCostTier[model.costTier] = (byCostTier[model.costTier] || 0) + 1;

      // By capability
      for (const capability of model.capabilities) {
        byCapability[capability] = (byCapability[capability] || 0) + 1;
      }
    }

    return {
      totalModels: models.length,
      recommendedModels: models.filter(m => m.recommended).length,
      byProvider,
      byPerformanceTier,
      byCostTier,
      byCapability,
      lastUpdate: this.lastUpdate
    };
  }

  /**
   * Get models with free tier availability
   * @returns {ModelSpec[]} - Array of models with free tier
   */
  getFreeTierModels() {
    return this.getAllModels().filter(m => m.freeTier);
  }

  /**
   * Check if a model has a free tier
   * @param {string} modelId - Model ID to check
   * @returns {boolean} - True if model has free tier
   */
  hasFreeTier(modelId) {
    const model = this.getModel(modelId);
    return model && !!model.freeTier;
  }

  /**
   * Get free tier limits for a model
   * @param {string} modelId - Model ID
   * @returns {Object|null} - Free tier limits or null if no free tier
   */
  getFreeTierLimits(modelId) {
    const model = this.getModel(modelId);
    return model && model.freeTier ? model.freeTier : null;
  }

  /**
   * Get models by free tier availability and provider
   * @param {string} [provider] - Optional provider filter
   * @returns {Object} - Object with free and paid model arrays
   */
  getModelsByFreeTier(provider) {
    let models = this.getAllModels();

    if (provider) {
      models = models.filter(m => m.provider === provider);
    }

    return {
      freeTier: models.filter(m => m.freeTier),
      paidOnly: models.filter(m => !m.freeTier)
    };
  }
}

module.exports = {
  ModelRegistry,
  ModelCapability,
  PerformanceTier,
  CostTier
};
