/**
 * Status Checker for BUMBA Setup
 * Comprehensive status checking for all components
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class StatusChecker {
  constructor(options = {}) {
    this.options = options;
    
    // Status results
    this.status = {
      apiKeys: {},
      mcpServers: {},
      bridge: {
        configured: false,
        running: false,
        port: null,
        pid: null
      },
      dependencies: {},
      system: {},
      overall: 'not-configured'
    };
    
    // API endpoints for testing
    this.apiEndpoints = {
      openai: 'https://api.openai.com/v1/models',
      anthropic: 'https://api.anthropic.com/v1/messages',
      google: 'https://generativelanguage.googleapis.com/v1/models',
      github: 'https://api.github.com/user'
    };
  }

  /**
   * Run complete status check
   */
  async checkAll() {
    const checks = await Promise.allSettled([
      this.checkAPIKeys(),
      this.checkMCPServers(),
      this.checkBridge(),
      this.checkDependencies(),
      this.checkSystem()
    ]);
    
    // Calculate overall status
    this.calculateOverallStatus();
    
    return this.status;
  }

  /**
   * Check API key validity
   */
  async checkAPIKeys() {
    const env = process.env;
    
    // OpenAI
    if (env.OPENAI_API_KEY) {
      this.status.apiKeys.openai = await this.validateOpenAI(env.OPENAI_API_KEY);
    }
    
    // Anthropic
    if (env.ANTHROPIC_API_KEY || env.CLAUDE_API_KEY) {
      const key = env.ANTHROPIC_API_KEY || env.CLAUDE_API_KEY;
      this.status.apiKeys.anthropic = await this.validateAnthropic(key);
    }
    
    // Google
    if (env.GOOGLE_API_KEY || env.GEMINI_API_KEY) {
      const key = env.GOOGLE_API_KEY || env.GEMINI_API_KEY;
      this.status.apiKeys.google = await this.validateGoogle(key);
    }
    
    // GitHub
    if (env.GITHUB_TOKEN) {
      this.status.apiKeys.github = await this.validateGitHub(env.GITHUB_TOKEN);
    }
    
    // Notion
    if (env.NOTION_API_KEY) {
      this.status.apiKeys.notion = await this.validateNotion(env.NOTION_API_KEY);
    }
    
    // OpenRouter
    if (env.OPENROUTER_API_KEY) {
      this.status.apiKeys.openrouter = {
        configured: true,
        valid: true, // Can't validate without making request
        provider: 'openrouter'
      };
    }
    
    return this.status.apiKeys;
  }

  /**
   * Validate OpenAI API key
   */
  async validateOpenAI(apiKey) {
    try {
      const response = await fetch(this.apiEndpoints.openai, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      return {
        configured: true,
        valid: response.status === 200,
        error: response.status === 401 ? 'Invalid API key' : null,
        models: response.status === 200 ? await this.getOpenAIModels(apiKey) : []
      };
    } catch (error) {
      return {
        configured: true,
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Validate Anthropic API key
   */
  async validateAnthropic(apiKey) {
    // Note: Anthropic doesn't have a simple validation endpoint
    // We check key format
    const validFormat = /^sk-ant-[a-zA-Z0-9\-]{95}$/.test(apiKey);
    
    return {
      configured: true,
      valid: validFormat,
      error: validFormat ? null : 'Invalid key format',
      models: validFormat ? ['claude-sonnet-4-5-20250929', 'claude-3-5-haiku-20241022'] : []
    };
  }

  /**
   * Validate Google API key
   */
  async validateGoogle(apiKey) {
    try {
      const response = await fetch(`${this.apiEndpoints.google}?key=${apiKey}`);
      
      return {
        configured: true,
        valid: response.status === 200,
        error: response.status === 403 ? 'Invalid API key' : null,
        models: response.status === 200 ? ['gemini-pro', 'gemini-pro-vision'] : []
      };
    } catch (error) {
      return {
        configured: true,
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Validate GitHub token
   */
  async validateGitHub(token) {
    try {
      const response = await fetch(this.apiEndpoints.github, {
        headers: {
          'Authorization': `token ${token}`
        }
      });
      
      return {
        configured: true,
        valid: response.status === 200,
        error: response.status === 401 ? 'Invalid token' : null,
        scopes: response.headers.get('x-oauth-scopes')?.split(', ') || []
      };
    } catch (error) {
      return {
        configured: true,
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Validate Notion API key
   */
  async validateNotion(apiKey) {
    try {
      const response = await fetch('https://api.notion.com/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28'
        }
      });
      
      return {
        configured: true,
        valid: response.status === 200,
        error: response.status === 401 ? 'Invalid API key' : null
      };
    } catch (error) {
      return {
        configured: true,
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Get available OpenAI models
   */
  async getOpenAIModels(apiKey) {
    try {
      const response = await fetch(this.apiEndpoints.openai, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      if (response.status === 200) {
        const data = await response.json();
        return data.data
          .filter(m => m.id.includes('gpt'))
          .map(m => m.id)
          .slice(0, 5);
      }
    } catch (error) {
      // Silent fail
    }
    
    return [];
  }

  /**
   * Check MCP servers
   */
  async checkMCPServers() {
    // Check if Claude is running
    const isClaudeRunning = await this.isProcessRunning('Claude');
    
    // Check MCP config file
    const mcpConfigPath = this.getMCPConfigPath();
    
    try {
      const content = await fs.readFile(mcpConfigPath, 'utf8');
      const config = JSON.parse(content);
      
      this.status.mcpServers = {
        configured: true,
        configPath: mcpConfigPath,
        claudeRunning: isClaudeRunning,
        servers: {}
      };
      
      // Check each server
      if (config.mcpServers) {
        for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
          this.status.mcpServers.servers[name] = {
            configured: true,
            command: serverConfig.command,
            // Can't verify if running without Claude API
            running: isClaudeRunning ? 'unknown' : false
          };
        }
      }
    } catch (error) {
      this.status.mcpServers = {
        configured: false,
        error: error.message
      };
    }
    
    return this.status.mcpServers;
  }

  /**
   * Check if process is running
   */
  async isProcessRunning(processName) {
    try {
      const platform = process.platform;
      let command;
      
      if (platform === 'darwin' || platform === 'linux') {
        command = `ps aux | grep -i ${processName} | grep -v grep`;
      } else if (platform === 'win32') {
        command = `tasklist | findstr /i ${processName}`;
      }
      
      const { stdout } = await execAsync(command);
      return stdout.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check bridge status
   */
  async checkBridge() {
    // Check if bridge is configured
    const bridgeConfigPath = path.join(process.cwd(), '.bumba', 'bridge-config.json');
    
    try {
      const content = await fs.readFile(bridgeConfigPath, 'utf8');
      const config = JSON.parse(content);
      
      this.status.bridge.configured = true;
      this.status.bridge.port = config.port || 3456;
      
      // Check if bridge is running
      const isRunning = await this.isPortInUse(this.status.bridge.port);
      this.status.bridge.running = isRunning;
      
    } catch (error) {
      this.status.bridge.configured = false;
    }
    
    return this.status.bridge;
  }

  /**
   * Check if port is in use
   */
  async isPortInUse(port) {
    try {
      const platform = process.platform;
      let command;
      
      if (platform === 'darwin' || platform === 'linux') {
        command = `lsof -i :${port}`;
      } else if (platform === 'win32') {
        command = `netstat -an | findstr :${port}`;
      }
      
      const { stdout } = await execAsync(command);
      return stdout.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check dependencies
   */
  async checkDependencies() {
    const requiredDeps = [
      'chalk',
      'inquirer',
      'ora',
      'dotenv',
      'express',
      'joi'
    ];
    
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    
    try {
      const content = await fs.readFile(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(content);
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };
      
      for (const dep of requiredDeps) {
        this.status.dependencies[dep] = {
          required: true,
          installed: !!allDeps[dep],
          version: allDeps[dep] || null
        };
      }
    } catch (error) {
      this.status.dependencies.error = error.message;
    }
    
    return this.status.dependencies;
  }

  /**
   * Check system information
   */
  async checkSystem() {
    const os = require('os');
    
    this.status.system = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      memory: {
        total: Math.round(os.totalmem() / 1024 / 1024 / 1024) + ' GB',
        free: Math.round(os.freemem() / 1024 / 1024 / 1024) + ' GB'
      },
      cpus: os.cpus().length,
      homeDir: os.homedir(),
      user: os.userInfo().username
    };
    
    return this.status.system;
  }

  /**
   * Get MCP config path
   */
  getMCPConfigPath() {
    const platform = process.platform;
    const homeDir = require('os').homedir();
    
    switch (platform) {
      case 'darwin':
        return path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
      case 'win32':
        return path.join(homeDir, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
      case 'linux':
        return path.join(homeDir, '.config', 'Claude', 'claude_desktop_config.json');
      default:
        return null;
    }
  }

  /**
   * Calculate overall status
   */
  calculateOverallStatus() {
    const hasAPIKeys = Object.keys(this.status.apiKeys).length > 0;
    const hasValidAPIKeys = Object.values(this.status.apiKeys).some(k => k.valid);
    const hasMCPServers = this.status.mcpServers.configured;
    const hasBridge = this.status.bridge.configured;
    
    if (hasValidAPIKeys && hasMCPServers && hasBridge) {
      this.status.overall = 'fully-configured';
    } else if (hasValidAPIKeys) {
      this.status.overall = 'partially-configured';
    } else if (hasAPIKeys) {
      this.status.overall = 'keys-configured';
    } else {
      this.status.overall = 'not-configured';
    }
    
    // Calculate percentage
    let score = 0;
    if (hasAPIKeys) score += 25;
    if (hasValidAPIKeys) score += 25;
    if (hasMCPServers) score += 25;
    if (hasBridge) score += 25;
    
    this.status.completionPercentage = score;
    
    return this.status.overall;
  }

  /**
   * Get status report
   */
  getReport() {
    return {
      overall: this.status.overall,
      completion: `${this.status.completionPercentage}%`,
      apiKeys: {
        configured: Object.keys(this.status.apiKeys).length,
        valid: Object.values(this.status.apiKeys).filter(k => k.valid).length,
        details: this.status.apiKeys
      },
      mcpServers: this.status.mcpServers,
      bridge: this.status.bridge,
      system: this.status.system
    };
  }
}

module.exports = StatusChecker;