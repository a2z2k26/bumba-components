/**
 * ObservabilityConfig - Unified configuration system for all observability modes
 *
 * Manages configuration for:
 * - Watch Mode: Real-time orchestration visualization
 * - Trace Mode: Trace recording and storage
 * - Compare Mode: A/B testing orchestration vs simple mode
 * - Dashboard Mode: Analytics dashboard
 *
 * Part of BUMBA Observability Enhancement - Phase 5
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class ObservabilityConfig {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(os.homedir(), '.bumba', 'observability-config.json');
    this.config = null;
    this.defaults = this._getDefaults();
  }

  /**
   * Get default configuration
   * @private
   */
  _getDefaults() {
    return {
      version: '1.0.0',
      modes: {
        watch: {
          enabled: false,
          autoEnable: false,
          displayOptions: {
            showTimestamps: true,
            showDurations: true,
            colorCoded: true,
            compactMode: false,
            showStepDetails: true
          }
        },
        trace: {
          enabled: false,
          autoEnable: false,
          retention: {
            maxDays: 30,
            maxFiles: 1000,
            autoCleanup: true
          },
          storage: {
            directory: path.join(os.homedir(), '.bumba', 'traces'),
            format: 'json',
            compression: false
          }
        },
        compare: {
          enabled: true,
          retention: {
            maxDays: 30,
            maxFiles: 500,
            autoCleanup: true
          },
          storage: {
            directory: path.join(os.homedir(), '.bumba', 'comparisons'),
            format: 'json'
          },
          thresholds: {
            minConfidence: 60,
            significantDurationDiff: 500,
            minQualityScore: 70
          }
        },
        dashboard: {
          enabled: true,
          defaults: {
            historyDays: 7,
            refreshInterval: null
          },
          thresholds: {
            successRate: 80,
            overheadPercent: 30,
            highSpecialistUsage: 3
          },
          analytics: {
            trackMetrics: true,
            exportFormats: ['json', 'html'],
            includeInsights: true,
            compareEnabled: true
          }
        }
      },
      global: {
        dataDirectory: path.join(os.homedir(), '.bumba'),
        debugMode: false,
        notifications: {
          enabled: true,
          onError: true,
          onComplete: false
        }
      },
      performance: {
        maxConcurrentTraces: 10,
        traceBufferSize: 100
      }
    };
  }

  /**
   * Load configuration from file
   * Creates default config if file doesn't exist
   */
  async load() {
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(configData);

      // Merge with defaults to ensure all fields exist
      this.config = this._mergeWithDefaults(this.config);

      return this.config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Config file doesn't exist, create with defaults
        this.config = this.defaults;
        await this.save();
        return this.config;
      }
      throw error;
    }
  }

  /**
   * Save configuration to file
   */
  async save() {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.configPath);
      await fs.mkdir(dir, { recursive: true });

      // Write config
      await fs.writeFile(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf-8'
      );

      return true;
    } catch (error) {
      console.error('Failed to save observability config:', error.message);
      return false;
    }
  }

  /**
   * Get current configuration
   */
  async get() {
    if (!this.config) {
      await this.load();
    }
    return this.config;
  }

  /**
   * Get configuration for specific mode
   * @param {string} mode - 'watch', 'trace', 'compare', or 'dashboard'
   */
  async getMode(mode) {
    if (!this.config) {
      await this.load();
    }

    if (!this.config.modes[mode]) {
      throw new Error(`Unknown mode: ${mode}`);
    }

    return this.config.modes[mode];
  }

  /**
   * Set configuration for specific mode
   * @param {string} mode - 'watch', 'trace', 'compare', or 'dashboard'
   * @param {object} modeConfig - Configuration object for the mode
   */
  async setMode(mode, modeConfig) {
    if (!this.config) {
      await this.load();
    }

    if (!this.config.modes[mode]) {
      throw new Error(`Unknown mode: ${mode}`);
    }

    // Merge with existing config
    this.config.modes[mode] = {
      ...this.config.modes[mode],
      ...modeConfig
    };

    await this.save();
    return this.config.modes[mode];
  }

  /**
   * Enable a specific observability mode
   * @param {string} mode - 'watch', 'trace', 'compare', or 'dashboard'
   */
  async enableMode(mode) {
    if (!this.config) {
      await this.load();
    }

    if (!this.config.modes[mode]) {
      throw new Error(`Unknown mode: ${mode}`);
    }

    this.config.modes[mode].enabled = true;
    await this.save();
    return true;
  }

  /**
   * Disable a specific observability mode
   * @param {string} mode - 'watch', 'trace', 'compare', or 'dashboard'
   */
  async disableMode(mode) {
    if (!this.config) {
      await this.load();
    }

    if (!this.config.modes[mode]) {
      throw new Error(`Unknown mode: ${mode}`);
    }

    this.config.modes[mode].enabled = false;
    await this.save();
    return true;
  }

  /**
   * Check if a mode is enabled
   * @param {string} mode - 'watch', 'trace', 'compare', or 'dashboard'
   */
  async isEnabled(mode) {
    if (!this.config) {
      await this.load();
    }

    if (!this.config.modes[mode]) {
      return false;
    }

    return this.config.modes[mode].enabled;
  }

  /**
   * Get global configuration
   */
  async getGlobal() {
    if (!this.config) {
      await this.load();
    }
    return this.config.global;
  }

  /**
   * Set global configuration
   * @param {object} globalConfig - Global configuration object
   */
  async setGlobal(globalConfig) {
    if (!this.config) {
      await this.load();
    }

    this.config.global = {
      ...this.config.global,
      ...globalConfig
    };

    await this.save();
    return this.config.global;
  }

  /**
   * Reset configuration to defaults
   */
  async reset() {
    this.config = this.defaults;
    await this.save();
    return this.config;
  }

  /**
   * Validate configuration
   * @returns {object} { valid: boolean, errors: string[] }
   */
  validate() {
    if (!this.config) {
      return { valid: false, errors: ['Configuration not loaded'] };
    }

    const errors = [];

    // Validate version
    if (!this.config.version) {
      errors.push('Missing version field');
    }

    // Validate modes
    const requiredModes = ['watch', 'trace', 'compare', 'dashboard'];
    requiredModes.forEach(mode => {
      if (!this.config.modes || !this.config.modes[mode]) {
        errors.push(`Missing configuration for ${mode} mode`);
      }
    });

    // Validate global config
    if (!this.config.global) {
      errors.push('Missing global configuration');
    } else {
      if (!this.config.global.dataDirectory) {
        errors.push('Missing global.dataDirectory');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get storage directory for a specific mode
   * @param {string} mode - 'trace' or 'compare'
   */
  async getStorageDirectory(mode) {
    if (!this.config) {
      await this.load();
    }

    if (mode === 'trace') {
      return this.config.modes.trace.storage.directory;
    } else if (mode === 'compare') {
      return this.config.modes.compare.storage.directory;
    }

    throw new Error(`No storage directory for mode: ${mode}`);
  }

  /**
   * Get retention policy for a specific mode
   * @param {string} mode - 'trace' or 'compare'
   */
  async getRetentionPolicy(mode) {
    if (!this.config) {
      await this.load();
    }

    if (mode === 'trace') {
      return this.config.modes.trace.retention;
    } else if (mode === 'compare') {
      return this.config.modes.compare.retention;
    }

    throw new Error(`No retention policy for mode: ${mode}`);
  }

  /**
   * Get thresholds for a specific mode
   * @param {string} mode - 'compare' or 'dashboard'
   */
  async getThresholds(mode) {
    if (!this.config) {
      await this.load();
    }

    if (mode === 'compare') {
      return this.config.modes.compare.thresholds;
    } else if (mode === 'dashboard') {
      return this.config.modes.dashboard.thresholds;
    }

    throw new Error(`No thresholds for mode: ${mode}`);
  }

  /**
   * Merge loaded config with defaults to ensure all fields exist
   * @private
   */
  _mergeWithDefaults(loadedConfig) {
    const merged = JSON.parse(JSON.stringify(this.defaults));

    // Deep merge function
    const deepMerge = (target, source) => {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          target[key] = target[key] || {};
          deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
      return target;
    };

    return deepMerge(merged, loadedConfig);
  }

  /**
   * Export configuration as JSON string
   */
  exportConfig() {
    if (!this.config) {
      return null;
    }
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from JSON string
   * @param {string} configJson - JSON string representation of config
   */
  async importConfig(configJson) {
    try {
      const importedConfig = JSON.parse(configJson);
      this.config = this._mergeWithDefaults(importedConfig);
      await this.save();
      return true;
    } catch (error) {
      console.error('Failed to import config:', error.message);
      return false;
    }
  }
}

module.exports = ObservabilityConfig;
