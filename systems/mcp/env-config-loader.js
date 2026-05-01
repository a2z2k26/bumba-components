/**
 * MCP Environment Configuration Loader
 * Handles loading and parsing of MCP server configuration from .env files
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class MCPEnvConfigLoader {
  constructor() {
    this.config = {};
    this.servers = new Map();
    this.loaded = false;
  }

  /**
   * Load MCP configuration from environment
   */
  async loadConfiguration() {
    try {
      // Priority order for .env files
      const envPaths = [
        path.join(process.cwd(), '.env'),                    // Project .env
        path.join(os.homedir(), 'Desktop', 'bumba-mcp.env'), // Desktop personal
        path.join(process.cwd(), '.env.example')             // Fallback template
      ];

      // Load first available env file
      let envContent = null;
      let loadedFrom = null;

      for (const envPath of envPaths) {
        try {
          envContent = await fs.readFile(envPath, 'utf8');
          loadedFrom = envPath;
          break;
        } catch (error) {
          // Continue to next path
          continue;
        }
      }

      if (!envContent) {
        console.warn('No MCP configuration file found, using defaults');
        return this.getDefaultConfiguration();
      }

      // Parse environment variables
      this.parseEnvContent(envContent);

      // Process MCP-specific configuration
      this.processMCPConfiguration();

      console.log(`✓ MCP configuration loaded from: ${loadedFrom}`);
      this.loaded = true;

      return this.config;

    } catch (error) {
      console.error('Failed to load MCP configuration:', error);
      return this.getDefaultConfiguration();
    }
  }

  /**
   * Parse .env file content
   */
  parseEnvContent(content) {
    const lines = content.split('\n');

    for (const line of lines) {
      // Skip comments and empty lines
      if (line.startsWith('#') || !line.trim()) continue;

      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        process.env[key.trim()] = value;
      }
    }
  }

  /**
   * Process MCP-specific configuration from environment
   */
  processMCPConfiguration() {

    // Process each category
    for (const [category, categoryConfig] of Object.entries(mcpSchema)) {
      if (category === 'global') {
        // Process global settings
        this.config.global = {};
        for (const [key, schema] of Object.entries(categoryConfig.settings || {})) {
          const value = this.getEnvValue(key, schema);
          this.config.global[key] = value;
        }
      } else if (categoryConfig.servers) {
        // Process server configurations
        for (const [key, schema] of Object.entries(categoryConfig.servers)) {
          const value = this.getEnvValue(key, schema);

          // Extract server name from key
          if (key.endsWith('_ENABLED')) {
            const serverName = this.extractServerName(key);
            if (!this.servers.has(serverName)) {
              this.servers.set(serverName, {
                category,
                enabled: value === 'true' || value === true,
                config: {}
              });
            } else {
              this.servers.get(serverName).enabled = value === 'true' || value === true;
            }
          } else {
            // It's a configuration parameter for a server
            const serverName = this.extractServerName(key);
            if (!this.servers.has(serverName)) {
              this.servers.set(serverName, {
                category,
                enabled: false,
                config: {}
              });
            }
            const configKey = this.extractConfigKey(key);
            this.servers.get(serverName).config[configKey] = value;
          }
        }
      }
    }

    this.config.servers = this.servers;
  }

  /**
   * Get environment value with type conversion
   */
  getEnvValue(key, schema) {
    const value = process.env[key];

    if (value === undefined) {
      return schema.default;
    }

    // Type conversion
    switch (schema.type) {
      case 'boolean':
        return value === 'true';
      case 'number':
        return parseFloat(value);
      case 'array':
        return value.split(',').map(v => v.trim());
      default:
        return value;
    }
  }

  /**
   * Extract server name from environment key
   */
  extractServerName(key) {
    // MCP_GITHUB_ENABLED -> github
    // MCP_BRAVE_SEARCH_ENABLED -> brave_search
    const parts = key.replace('MCP_', '').toLowerCase().split('_');

    // Remove trailing keywords
    const keywords = ['enabled', 'token', 'key', 'url', 'path', 'id', 'secret', 'collection', 'dir', 'paths'];
    const filtered = parts.filter(p => !keywords.includes(p));

    return filtered.join('_');
  }

  /**
   * Extract configuration key from environment key
   */
  extractConfigKey(key) {
    // MCP_GITHUB_TOKEN -> token
    // MCP_POSTGRES_URL -> url
    const parts = key.replace('MCP_', '').toLowerCase().split('_');
    return parts[parts.length - 1];
  }

  /**
   * Get default configuration (core servers only)
   */
  getDefaultConfiguration() {
    return {
      servers: new Map([
        ['memory', {
          category: 'core',
          enabled: true,
          config: {}
        }],
        ['filesystem', {
          category: 'core',
          enabled: true,
          config: {
            paths: ['~/Claude', '~/Desktop', '~/Documents']
          }
        }],
        ['sequential_thinking', {
          category: 'core',
          enabled: true,
          config: {}
        }]
      ]),
      global: {
        MCP_AUTO_ENABLE_CORE: true,
        MCP_RECOMMENDATION_THRESHOLD: 0.8,
        MCP_SESSION_PERSISTENCE: true,
        MCP_MAX_CONCURRENT: 7
      }
    };
  }

  /**
   * Get server configuration by name
   */
  getServerConfig(serverName) {
    return this.servers.get(serverName);
  }

  /**
   * Get all enabled servers
   */
  getEnabledServers() {
    const enabled = [];
    for (const [name, config] of this.servers) {
      if (config.enabled) {
        enabled.push({ name, ...config });
      }
    }
    return enabled;
  }

  /**
   * Get servers by category
   */
  getServersByCategory(category) {
    const servers = [];
    for (const [name, config] of this.servers) {
      if (config.category === category) {
        servers.push({ name, ...config });
      }
    }
    return servers;
  }

  /**
   * Check if configuration is loaded
   */
  isLoaded() {
    return this.loaded;
  }
}

// Export singleton instance
let instance = null;

function getInstance() {
  if (!instance) {
    instance = new MCPEnvConfigLoader();
  }
  return instance;
}

module.exports = {
  MCPEnvConfigLoader,
  getInstance
};