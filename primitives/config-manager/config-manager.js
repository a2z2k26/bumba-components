/**
 * Configuration Manager Utilities
 * Handles reading, writing, and merging configurations
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class ConfigManager {
  constructor() {
    // Configuration paths
    this.defaultConfigPath = path.join(__dirname, '..', 'config', 'default-config.json');
    this.globalConfigPath = path.join(os.homedir(), '.bumba', 'config.json');
    this.projectConfigPath = path.join(process.cwd(), '.bumba', 'config.json');

    // Backup paths
    this.globalBackupPath = path.join(os.homedir(), '.bumba', 'config.backup.json');
    this.projectBackupPath = path.join(process.cwd(), '.bumba', 'config.backup.json');
  }

  /**
   * Ensure directory exists
   * @param {string} dirPath Directory path to ensure
   */
  ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Read configuration file
   * @param {string} configPath Path to config file
   * @returns {object|null} Parsed config or null if not found
   */
  readConfig(configPath) {
    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error(`Error reading config from ${configPath}:`, error.message);
    }
    return null;
  }

  /**
   * Write configuration file
   * @param {string} configPath Path to write config
   * @param {object} config Configuration object
   * @param {boolean} backup Whether to backup existing config
   */
  writeConfig(configPath, config, backup = true) {
    try {
      // Ensure directory exists
      const dir = path.dirname(configPath);
      this.ensureDirectory(dir);

      // Create required subdirectories for BUMBA
      if (configPath.includes('.bumba')) {
        const bumbaDir = path.dirname(configPath);
        const subdirs = ['tasks', 'context', 'cache', 'logs', 'analytics', 'metrics', 'config', 'learning'];
        for (const subdir of subdirs) {
          const subdirPath = path.join(bumbaDir, subdir);
          this.ensureDirectory(subdirPath);
        }
      }

      // Backup existing config if requested
      if (backup && fs.existsSync(configPath)) {
        const backupPath = configPath.replace('.json', '.backup.json');
        fs.copyFileSync(configPath, backupPath);
      }

      // Write new config
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      return true;
    } catch (error) {
      console.error(`Error writing config to ${configPath}:`, error.message);
      return false;
    }
  }

  /**
   * Deep merge objects (right overwrites left)
   * @param {object} target Target object
   * @param {object} source Source object
   * @returns {object} Merged object
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          // Recursively merge objects
          result[key] = this.deepMerge(result[key] || {}, source[key]);
        } else {
          // Replace primitives and arrays
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * Load merged configuration (default + global + project)
   * @returns {object} Merged configuration
   */
  loadMergedConfig() {
    // Start with defaults
    let config = this.readConfig(this.defaultConfigPath) || {};

    // Merge global config if exists
    const globalConfig = this.readConfig(this.globalConfigPath);
    if (globalConfig) {
      config = this.deepMerge(config, globalConfig);
    }

    // Merge project config if exists
    const projectConfig = this.readConfig(this.projectConfigPath);
    if (projectConfig) {
      config = this.deepMerge(config, projectConfig);
    }

    return config;
  }

  /**
   * Save configuration to appropriate location
   * @param {object} config Configuration to save
   * @param {string} scope 'global' or 'project'
   */
  saveConfig(config, scope = 'project') {
    const configPath = scope === 'global' ? this.globalConfigPath : this.projectConfigPath;

    // Add metadata
    try { config.version = require('./package.json').version; } catch(e) { config.version = '1.0.0'; }
    config.initialized = config.initialized || new Date().toISOString();

    return this.writeConfig(configPath, config);
  }

  /**
   * Update specific configuration values
   * @param {object} updates Updates to apply
   * @param {string} scope 'global' or 'project'
   */
  updateConfig(updates, scope = 'project') {
    const configPath = scope === 'global' ? this.globalConfigPath : this.projectConfigPath;

    // Load existing config or defaults
    let config = this.readConfig(configPath);
    if (!config) {
      config = this.readConfig(this.defaultConfigPath) || {};
    }

    // Merge updates
    config = this.deepMerge(config, updates);

    // Save updated config
    return this.saveConfig(config, scope);
  }

  /**
   * Reset configuration to defaults
   * @param {string} scope 'global', 'project', or 'both'
   */
  resetConfig(scope = 'project') {
    const defaultConfig = this.readConfig(this.defaultConfigPath) || {};

    if (scope === 'global' || scope === 'both') {
      this.writeConfig(this.globalConfigPath, defaultConfig);
    }

    if (scope === 'project' || scope === 'both') {
      this.writeConfig(this.projectConfigPath, defaultConfig);
    }
  }

  /**
   * Check if configuration exists
   * @param {string} scope 'global' or 'project'
   * @returns {boolean}
   */
  configExists(scope = 'project') {
    const configPath = scope === 'global' ? this.globalConfigPath : this.projectConfigPath;
    return fs.existsSync(configPath);
  }

  /**
   * Get configuration value by path (e.g., 'features.notion')
   * @param {string} keyPath Dot-separated path
   * @param {*} defaultValue Default value if not found
   * @returns {*} Configuration value
   */
  getValue(keyPath, defaultValue = null) {
    const config = this.loadMergedConfig();
    const keys = keyPath.split('.');

    let value = config;
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  /**
   * Set configuration value by path
   * @param {string} keyPath Dot-separated path
   * @param {*} value Value to set
   * @param {string} scope 'global' or 'project'
   */
  setValue(keyPath, value, scope = 'project') {
    const keys = keyPath.split('.');
    const updates = {};

    // Build nested update object
    let current = updates;
    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;

    return this.updateConfig(updates, scope);
  }
}

module.exports = ConfigManager;