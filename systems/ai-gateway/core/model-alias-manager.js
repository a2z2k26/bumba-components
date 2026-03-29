/**
 * Sprint 2-16: Model Alias Manager
 * Provides shortcuts and aliases for AI model names
 */

const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const EventEmitter = require('events');

class ModelAliasManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.configDir = options.configDir || path.join(process.cwd(), '.bumba', 'config');
    this.configFile = path.join(this.configDir, 'model-aliases.json');

    // Default aliases for common models
    this.defaultAliases = {
      // OpenAI GPT-4
      'gpt4': 'gpt-4-0125-preview',
      'gpt4-turbo': 'gpt-4-turbo-preview',
      'gpt4-vision': 'gpt-4-vision-preview',
      '4': 'gpt-4-0125-preview',

      // OpenAI GPT-3.5
      'gpt3': 'gpt-3.5-turbo',
      'gpt35': 'gpt-3.5-turbo',
      '3': 'gpt-3.5-turbo',
      'turbo': 'gpt-3.5-turbo',

      // OpenAI O1
      'o1': 'o1-preview',
      'o1-mini': 'o1-mini',

      // Anthropic Claude
      'claude': 'claude-sonnet-4-5-20250929',
      'sonnet': 'claude-sonnet-4-5-20250929',
      'opus': 'claude-3-opus-20240229',
      'haiku': 'claude-3-haiku-20240307',
      'claude3': 'claude-sonnet-4-5-20250929',
      'claude-sonnet': 'claude-sonnet-4-5-20250929',
      'claude-opus': 'claude-3-opus-20240229',
      'claude-haiku': 'claude-3-haiku-20240307',

      // Google Gemini
      'gemini': 'gemini-pro',
      'gemini-pro': 'gemini-pro',
      'gemini-ultra': 'gemini-ultra',

      // Meta Llama
      'llama': 'llama-2-70b',
      'llama2': 'llama-2-70b',
      'llama3': 'llama-3-70b',

      // Mistral
      'mistral': 'mistral-medium',
      'mixtral': 'mixtral-8x7b',

      // Fast/cheap models
      'fast': 'gpt-3.5-turbo',
      'cheap': 'gpt-3.5-turbo',
      'quick': 'claude-3-haiku-20240307',

      // Quality models
      'best': 'gpt-4-0125-preview',
      'premium': 'claude-sonnet-4-5-20250929',
      'smart': 'claude-sonnet-4-5-20250929'
    };

    // User-defined aliases (loaded from config)
    this.customAliases = {};

    // Alias usage statistics
    this.usageStats = new Map();
  }

  /**
   * Initialize alias manager
   */
  async initialize() {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
      await this.loadAliases();
      this.emit('initialized');
    } catch (error) {
      console.error(chalk.red('Failed to initialize model aliases:'), error.message);
    }
  }

  /**
   * Resolve alias to full model name
   */
  resolve(aliasOrModel) {
    if (!aliasOrModel) {
      return null;
    }

    const normalized = aliasOrModel.toLowerCase().trim();

    // Check custom aliases first (user overrides)
    if (this.customAliases[normalized]) {
      this.trackUsage(normalized);
      return this.customAliases[normalized];
    }

    // Check default aliases
    if (this.defaultAliases[normalized]) {
      this.trackUsage(normalized);
      return this.defaultAliases[normalized];
    }

    // If not an alias, return as-is (assume it's a full model name)
    return aliasOrModel;
  }

  /**
   * Check if a string is an alias
   */
  isAlias(name) {
    const normalized = name.toLowerCase().trim();
    return !!(this.customAliases[normalized] || this.defaultAliases[normalized]);
  }

  /**
   * Get the alias for a model (reverse lookup)
   */
  getAliasesForModel(modelName) {
    const aliases = [];

    // Check custom aliases
    for (const [alias, model] of Object.entries(this.customAliases)) {
      if (model === modelName) {
        aliases.push(alias);
      }
    }

    // Check default aliases
    for (const [alias, model] of Object.entries(this.defaultAliases)) {
      if (model === modelName) {
        aliases.push(alias);
      }
    }

    return aliases;
  }

  /**
   * Set a custom alias
   */
  async setAlias(alias, modelName) {
    const normalized = alias.toLowerCase().trim();

    // Validate
    if (!normalized || !modelName) {
      throw new Error('Both alias and model name are required');
    }

    if (normalized === modelName.toLowerCase()) {
      throw new Error('Alias cannot be the same as model name');
    }

    // Warn if overriding default
    if (this.defaultAliases[normalized]) {
      console.warn(chalk.yellow(`Warning: Overriding default alias '${normalized}'`));
    }

    this.customAliases[normalized] = modelName;

    await this.saveAliases();
    this.emit('alias-set', { alias: normalized, model: modelName });

    return true;
  }

  /**
   * Remove a custom alias
   */
  async removeAlias(alias) {
    const normalized = alias.toLowerCase().trim();

    if (!this.customAliases[normalized]) {
      throw new Error(`Custom alias '${alias}' not found`);
    }

    delete this.customAliases[normalized];

    await this.saveAliases();
    this.emit('alias-removed', { alias: normalized });

    return true;
  }

  /**
   * List all aliases
   */
  listAliases(options = {}) {
    const aliases = [];

    // Add custom aliases
    for (const [alias, model] of Object.entries(this.customAliases)) {
      aliases.push({
        alias,
        model,
        source: 'custom',
        usage: this.usageStats.get(alias) || 0
      });
    }

    // Add default aliases (unless hidden)
    if (!options.customOnly) {
      for (const [alias, model] of Object.entries(this.defaultAliases)) {
        // Skip if overridden by custom
        if (!this.customAliases[alias]) {
          aliases.push({
            alias,
            model,
            source: 'default',
            usage: this.usageStats.get(alias) || 0
          });
        }
      }
    }

    // Filter by provider if requested
    if (options.provider) {
      const providerFilter = options.provider.toLowerCase();
      return aliases.filter(a =>
        a.model.toLowerCase().includes(providerFilter)
      );
    }

    // Sort by usage or alphabetically
    if (options.sortBy === 'usage') {
      return aliases.sort((a, b) => b.usage - a.usage);
    }

    return aliases.sort((a, b) => a.alias.localeCompare(b.alias));
  }

  /**
   * Search aliases
   */
  searchAliases(query) {
    const normalized = query.toLowerCase();
    const results = [];

    // Search custom aliases
    for (const [alias, model] of Object.entries(this.customAliases)) {
      if (alias.includes(normalized) || model.toLowerCase().includes(normalized)) {
        results.push({
          alias,
          model,
          source: 'custom',
          matchType: alias.includes(normalized) ? 'alias' : 'model'
        });
      }
    }

    // Search default aliases
    for (const [alias, model] of Object.entries(this.defaultAliases)) {
      if (!this.customAliases[alias]) {
        if (alias.includes(normalized) || model.toLowerCase().includes(normalized)) {
          results.push({
            alias,
            model,
            source: 'default',
            matchType: alias.includes(normalized) ? 'alias' : 'model'
          });
        }
      }
    }

    return results;
  }

  /**
   * Get suggestions for partial alias
   */
  getSuggestions(partial) {
    const normalized = partial.toLowerCase();
    const suggestions = [];

    // Get all aliases
    const allAliases = [
      ...Object.keys(this.customAliases),
      ...Object.keys(this.defaultAliases).filter(a => !this.customAliases[a])
    ];

    // Find matches
    for (const alias of allAliases) {
      if (alias.startsWith(normalized)) {
        const model = this.customAliases[alias] || this.defaultAliases[alias];
        suggestions.push({
          alias,
          model,
          usage: this.usageStats.get(alias) || 0
        });
      }
    }

    // Sort by usage, then length
    return suggestions.sort((a, b) => {
      if (a.usage !== b.usage) {
        return b.usage - a.usage;
      }
      return a.alias.length - b.alias.length;
    });
  }

  /**
   * Track alias usage
   */
  trackUsage(alias) {
    const current = this.usageStats.get(alias) || 0;
    this.usageStats.set(alias, current + 1);
  }

  /**
   * Get usage statistics
   */
  getStats() {
    const stats = {
      totalAliases: Object.keys(this.customAliases).length + Object.keys(this.defaultAliases).length,
      customAliases: Object.keys(this.customAliases).length,
      defaultAliases: Object.keys(this.defaultAliases).length,
      totalUsage: 0,
      mostUsed: []
    };

    // Calculate total usage
    for (const count of this.usageStats.values()) {
      stats.totalUsage += count;
    }

    // Get most used
    const usageArray = Array.from(this.usageStats.entries())
      .map(([alias, count]) => ({
        alias,
        model: this.resolve(alias),
        count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    stats.mostUsed = usageArray;

    return stats;
  }

  /**
   * Load aliases from config file
   */
  async loadAliases() {
    try {
      const data = await fs.readFile(this.configFile, 'utf8');
      const config = JSON.parse(data);

      this.customAliases = config.aliases || {};

      if (config.usageStats) {
        this.usageStats = new Map(Object.entries(config.usageStats));
      }

    } catch (error) {
      // Config file doesn't exist yet
      this.customAliases = {};
    }
  }

  /**
   * Save aliases to config file
   */
  async saveAliases() {
    try {
      const config = {
        aliases: this.customAliases,
        usageStats: Object.fromEntries(this.usageStats),
        updatedAt: new Date().toISOString()
      };

      await fs.writeFile(
        this.configFile,
        JSON.stringify(config, null, 2),
        'utf8'
      );

    } catch (error) {
      console.error(chalk.red('Failed to save aliases:'), error.message);
    }
  }

  /**
   * Reset to defaults
   */
  async resetToDefaults() {
    this.customAliases = {};
    this.usageStats.clear();
    await this.saveAliases();
    this.emit('reset');
  }

  /**
   * Export configuration
   */
  exportConfig() {
    return {
      customAliases: { ...this.customAliases },
      defaultAliases: { ...this.defaultAliases },
      stats: this.getStats()
    };
  }

  /**
   * Import configuration
   */
  async importConfig(config) {
    if (config.customAliases) {
      this.customAliases = { ...config.customAliases };
      await this.saveAliases();
    }
  }
}

module.exports = ModelAliasManager;
