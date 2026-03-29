/**
 * MCP Config Generator for BUMBA Setup Wizard
 * Generates claude_desktop_config.json for MCP servers
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class MCPConfigGenerator {
  constructor(options = {}) {
    this.options = {
      createBackup: options.createBackup !== false,
      mergeExisting: options.mergeExisting !== false,
      ...options
    };
    
    // Platform-specific config path
    this.configPath = this.getConfigPath();
    
    // MCP server definitions
    this.serverDefinitions = this.getServerDefinitions();
    
    // Existing configuration
    this.existingConfig = null;
    this.backupPath = null;
  }

  /**
   * Get MCP config path based on platform
   */
  getConfigPath() {
    const platform = process.platform;
    const homeDir = os.homedir();
    
    switch (platform) {
      case 'darwin': // macOS
        return path.join(
          homeDir,
          'Library',
          'Application Support',
          'Claude',
          'claude_desktop_config.json'
        );
      case 'win32': // Windows
        return path.join(
          homeDir,
          'AppData',
          'Roaming',
          'Claude',
          'claude_desktop_config.json'
        );
      case 'linux': // Linux
        return path.join(
          homeDir,
          '.config',
          'Claude',
          'claude_desktop_config.json'
        );
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Get MCP server definitions
   */
  getServerDefinitions() {
    return {
      filesystem: {
        name: 'Filesystem',
        description: 'File read/write operations',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        env: {},
        required: true
      },
      memory: {
        name: 'Memory',
        description: 'Persistent memory and state management',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
        env: {},
        required: true
      },
      github: {
        name: 'GitHub',
        description: 'Repository and PR management',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: {
          GITHUB_TOKEN: '${GITHUB_TOKEN}'
        },
        requiresAuth: true
      },
      notion: {
        name: 'Notion',
        description: 'Database and document access',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-notion'],
        env: {
          NOTION_API_KEY: '${NOTION_API_KEY}'
        },
        requiresAuth: true
      },
      fetch: {
        name: 'Fetch',
        description: 'HTTP requests and web scraping',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-fetch'],
        env: {},
        required: false
      },
      'sequential-thinking': {
        name: 'Sequential Thinking',
        description: 'Chain of thought reasoning',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
        env: {},
        required: false
      },
      brave: {
        name: 'Brave Search',
        description: 'Web search using Brave',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave'],
        env: {
          BRAVE_API_KEY: '${BRAVE_API_KEY}'
        },
        requiresAuth: true
      },
      puppeteer: {
        name: 'Puppeteer',
        description: 'Browser automation and scraping',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-puppeteer'],
        env: {},
        required: false
      },
      postgres: {
        name: 'PostgreSQL',
        description: 'PostgreSQL database access',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres'],
        env: {
          POSTGRES_URL: '${POSTGRES_URL}'
        },
        requiresAuth: true
      },
      slack: {
        name: 'Slack',
        description: 'Slack workspace integration',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-slack'],
        env: {
          SLACK_TOKEN: '${SLACK_TOKEN}'
        },
        requiresAuth: true
      }
    };
  }

  /**
   * Generate MCP configuration
   */
  async generateConfig(selectedServers = [], apiKeys = {}) {
    // Load existing config if merging
    if (this.options.mergeExisting) {
      await this.loadExistingConfig();
    }
    
    // Create base configuration
    const config = {
      version: '1.0',
      mcpServers: {},
      ...this.existingConfig
    };
    
    // Add selected servers
    for (const serverName of selectedServers) {
      const definition = this.serverDefinitions[serverName];
      if (!definition) continue;
      
      // Build server configuration
      const serverConfig = {
        command: definition.command,
        args: [...definition.args]
      };
      
      // Add environment variables if needed
      if (definition.env && Object.keys(definition.env).length > 0) {
        serverConfig.env = {};
        
        for (const [envKey, envValue] of Object.entries(definition.env)) {
          // Replace placeholders with actual values
          const actualKey = envValue.replace('${', '').replace('}', '');
          
          if (apiKeys[actualKey.toLowerCase().replace('_', '')]) {
            serverConfig.env[envKey] = apiKeys[actualKey.toLowerCase().replace('_', '')];
          } else if (process.env[actualKey]) {
            serverConfig.env[envKey] = process.env[actualKey];
          } else {
            // Keep placeholder for manual configuration
            serverConfig.env[envKey] = envValue;
          }
        }
      }
      
      // Add to configuration
      config.mcpServers[serverName] = serverConfig;
    }
    
    return config;
  }

  /**
   * Load existing MCP configuration
   */
  async loadExistingConfig() {
    try {
      const content = await fs.readFile(this.configPath, 'utf8');
      this.existingConfig = JSON.parse(content);
      return this.existingConfig;
    } catch (error) {
      // Config doesn't exist or is invalid
      this.existingConfig = null;
      return null;
    }
  }

  /**
   * Write MCP configuration to file
   */
  async writeConfig(config) {
    try {
      // Create backup if requested
      if (this.options.createBackup && this.existingConfig) {
        await this.createBackup();
      }
      
      // Ensure directory exists
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });
      
      // Write configuration
      const content = JSON.stringify(config, null, 2);
      await fs.writeFile(this.configPath, content, 'utf8');
      
      // Set appropriate permissions (Unix-like systems)
      if (process.platform !== 'win32') {
        await fs.chmod(this.configPath, 0o644);
      }
      
      return {
        success: true,
        path: this.configPath,
        backup: this.backupPath
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create backup of existing configuration
   */
  async createBackup() {
    if (!this.existingConfig) return null;
    
    const backupDir = path.join(path.dirname(this.configPath), 'backups');
    await fs.mkdir(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `claude_config_backup_${timestamp}.json`;
    this.backupPath = path.join(backupDir, backupFilename);
    
    await fs.writeFile(
      this.backupPath,
      JSON.stringify(this.existingConfig, null, 2),
      'utf8'
    );
    
    return this.backupPath;
  }

  /**
   * Validate MCP configuration
   */
  validateConfig(config) {
    const errors = [];
    const warnings = [];
    
    // Check required fields
    if (!config.mcpServers) {
      errors.push('Missing mcpServers field');
    }
    
    // Validate each server
    for (const [serverName, serverConfig] of Object.entries(config.mcpServers || {})) {
      // Check command
      if (!serverConfig.command) {
        errors.push(`Server ${serverName}: missing command`);
      }
      
      // Check for placeholder environment variables
      if (serverConfig.env) {
        for (const [key, value] of Object.entries(serverConfig.env)) {
          if (value.includes('${')) {
            warnings.push(`Server ${serverName}: ${key} contains placeholder`);
          }
        }
      }
      
      // Check if required servers are present
      const definition = this.serverDefinitions[serverName];
      if (definition?.requiresAuth && !serverConfig.env) {
        warnings.push(`Server ${serverName}: requires authentication but no env vars set`);
      }
    }
    
    // Check for essential servers
    const hasFilesystem = config.mcpServers?.filesystem;
    const hasMemory = config.mcpServers?.memory;
    
    if (!hasFilesystem) {
      warnings.push('Filesystem server not configured (recommended)');
    }
    
    if (!hasMemory) {
      warnings.push('Memory server not configured (recommended)');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Generate installation script for MCP servers
   */
  generateInstallScript(selectedServers = []) {
    const lines = ['#!/bin/bash', '', '# MCP Server Installation Script', ''];
    
    // Add installation commands
    for (const serverName of selectedServers) {
      const definition = this.serverDefinitions[serverName];
      if (!definition) continue;
      
      lines.push(`# Install ${definition.name}`);
      lines.push(`echo "Installing ${definition.name}..."`);
      
      // Build npm install command
      const packageName = definition.args.find(arg => arg.startsWith('@'));
      if (packageName) {
        lines.push(`npm install -g ${packageName}`);
      }
      
      lines.push('');
    }
    
    // Add verification
    lines.push('# Verify installations');
    lines.push('echo "Verifying MCP server installations..."');
    
    for (const serverName of selectedServers) {
      const definition = this.serverDefinitions[serverName];
      const packageName = definition.args.find(arg => arg.startsWith('@'));
      if (packageName) {
        lines.push(`npm list -g ${packageName} || echo "⚠️  ${definition.name} not installed"`);
      }
    }
    
    lines.push('');
    lines.push('echo "✅ MCP server installation complete!"');
    lines.push('echo "Please restart Claude to activate the servers."');
    
    return lines.join('\n');
  }

  /**
   * Get recommended servers based on API keys
   */
  getRecommendedServers(apiKeys = {}) {
    const recommended = ['filesystem', 'memory']; // Always recommend these
    
    if (apiKeys.github) {
      recommended.push('github');
    }
    
    if (apiKeys.notion) {
      recommended.push('notion');
    }
    
    // Add fetch for general web access
    recommended.push('fetch');
    
    // Add sequential thinking for better reasoning
    recommended.push('sequential-thinking');
    
    return recommended;
  }

  /**
   * Check if Claude is installed
   */
  async isClaudeInstalled() {
    const platform = process.platform;
    
    try {
      if (platform === 'darwin') {
        // Check macOS Applications folder
        const apps = await fs.readdir('/Applications');
        return apps.some(app => app.toLowerCase().includes('claude'));
      } else if (platform === 'win32') {
        // Check Windows Program Files
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        const { stdout } = await execAsync('where claude');
        return stdout.trim().length > 0;
      } else {
        // Check Linux PATH
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        const { stdout } = await execAsync('which claude');
        return stdout.trim().length > 0;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Get summary of configuration
   */
  getSummary(config) {
    const servers = Object.keys(config.mcpServers || {});
    const authRequired = servers.filter(s => 
      this.serverDefinitions[s]?.requiresAuth
    );
    
    return {
      totalServers: servers.length,
      servers,
      authRequired,
      hasEssentials: servers.includes('filesystem') && servers.includes('memory'),
      configPath: this.configPath
    };
  }
}

module.exports = MCPConfigGenerator;