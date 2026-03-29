/**
 * Configuration Detector for BUMBA Setup
 * Detects existing configurations, API keys, and MCP servers
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class ConfigDetector {
  constructor(options = {}) {
    this.options = {
      projectRoot: options.projectRoot || process.cwd(),
      ...options
    };
    
    // Detection results
    this.detected = {
      envFile: null,
      envContent: {},
      mcpConfig: null,
      mcpServers: [],
      gitignore: null,
      packageJson: null,
      existingKeys: [],
      bumbaConfig: null
    };
    
    // Platform-specific paths
    this.paths = this.getPlatformPaths();
  }

  /**
   * Get platform-specific paths
   */
  getPlatformPaths() {
    const homeDir = os.homedir();
    const platform = process.platform;
    
    const paths = {
      homeDir,
      platform,
      env: [
        path.join(this.options.projectRoot, '.env'),
        path.join(this.options.projectRoot, '.env.local'),
        path.join(this.options.projectRoot, '.env.development')
      ],
      gitignore: path.join(this.options.projectRoot, '.gitignore'),
      packageJson: path.join(this.options.projectRoot, 'package.json'),
      bumbaConfig: path.join(this.options.projectRoot, '.bumba', 'config.json')
    };
    
    // MCP config path based on platform
    switch (platform) {
      case 'darwin': // macOS
        paths.mcpConfig = path.join(
          homeDir,
          'Library',
          'Application Support',
          'Claude',
          'claude_desktop_config.json'
        );
        break;
      case 'win32': // Windows
        paths.mcpConfig = path.join(
          homeDir,
          'AppData',
          'Roaming',
          'Claude',
          'claude_desktop_config.json'
        );
        break;
      case 'linux': // Linux
        paths.mcpConfig = path.join(
          homeDir,
          '.config',
          'Claude',
          'claude_desktop_config.json'
        );
        break;
      default:
        paths.mcpConfig = null;
    }
    
    return paths;
  }

  /**
   * Run full detection
   */
  async detectAll() {
    const results = await Promise.allSettled([
      this.detectEnvFile(),
      this.detectMCPConfig(),
      this.detectGitignore(),
      this.detectPackageJson(),
      this.detectBumbaConfig()
    ]);
    
    // Analyze detection results
    const summary = this.analyzeDete

ction();
    
    return {
      detected: this.detected,
      summary,
      paths: this.paths
    };
  }

  /**
   * Detect .env files
   */
  async detectEnvFile() {
    for (const envPath of this.paths.env) {
      try {
        const content = await fs.readFile(envPath, 'utf8');
        this.detected.envFile = envPath;
        this.detected.envContent = this.parseEnv(content);
        
        // Detect existing API keys
        this.detectAPIKeys(this.detected.envContent);
        
        return true;
      } catch (error) {
        // File doesn't exist, continue checking
      }
    }
    
    return false;
  }

  /**
   * Parse .env file content
   */
  parseEnv(content) {
    const env = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
      // Skip comments and empty lines
      if (line.startsWith('#') || !line.trim()) continue;
      
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        env[key.trim()] = value.replace(/^["']|["']$/g, '');
      }
    }
    
    return env;
  }

  /**
   * Detect API keys in environment
   */
  detectAPIKeys(env) {
    const keyPatterns = {
      openai: /^(OPENAI_API_KEY|OPENAI_KEY)$/,
      anthropic: /^(ANTHROPIC_API_KEY|CLAUDE_API_KEY|CLAUDE_KEY)$/,
      google: /^(GOOGLE_API_KEY|GEMINI_API_KEY|GOOGLE_AI_KEY)$/,
      openrouter: /^(OPENROUTER_API_KEY|OPENROUTER_KEY)$/,
      github: /^(GITHUB_TOKEN|GITHUB_PAT|GH_TOKEN)$/,
      notion: /^(NOTION_API_KEY|NOTION_KEY|NOTION_TOKEN)$/,
      pinecone: /^(PINECONE_API_KEY|PINECONE_KEY)$/,
      deepseek: /^(DEEPSEEK_API_KEY|DEEPSEEK_KEY)$/,
      qwen: /^(QWEN_API_KEY|QWEN_KEY)$/,
      kimi: /^(KIMI_API_KEY|KIMI_KEY)$/
    };
    
    this.detected.existingKeys = [];
    
    for (const [provider, pattern] of Object.entries(keyPatterns)) {
      for (const envKey of Object.keys(env)) {
        if (pattern.test(envKey) && env[envKey]) {
          this.detected.existingKeys.push({
            provider,
            key: envKey,
            value: this.maskKey(env[envKey])
          });
        }
      }
    }
    
    return this.detected.existingKeys;
  }

  /**
   * Mask API key for display
   */
  maskKey(key) {
    if (!key || key.length < 8) return '***';
    
    const visibleChars = 4;
    const start = key.substring(0, visibleChars);
    const masked = '*'.repeat(Math.min(key.length - visibleChars, 20));
    
    return `${start}${masked}`;
  }

  /**
   * Detect MCP configuration
   */
  async detectMCPConfig() {
    if (!this.paths.mcpConfig) {
      return false;
    }
    
    try {
      const content = await fs.readFile(this.paths.mcpConfig, 'utf8');
      const config = JSON.parse(content);
      
      this.detected.mcpConfig = this.paths.mcpConfig;
      this.detected.mcpServers = [];
      
      // Extract configured MCP servers
      if (config.mcpServers) {
        for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
          this.detected.mcpServers.push({
            name,
            command: serverConfig.command,
            args: serverConfig.args,
            configured: true
          });
        }
      }
      
      return true;
    } catch (error) {
      // MCP config doesn't exist or is invalid
      return false;
    }
  }

  /**
   * Detect .gitignore
   */
  async detectGitignore() {
    try {
      const content = await fs.readFile(this.paths.gitignore, 'utf8');
      this.detected.gitignore = {
        path: this.paths.gitignore,
        hasEnv: content.includes('.env'),
        hasBumba: content.includes('.bumba'),
        content
      };
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Detect package.json
   */
  async detectPackageJson() {
    try {
      const content = await fs.readFile(this.paths.packageJson, 'utf8');
      const packageJson = JSON.parse(content);
      
      this.detected.packageJson = {
        path: this.paths.packageJson,
        name: packageJson.name,
        version: packageJson.version,
        hasBumba: !!(packageJson.dependencies?.['bumba-cli'] || 
                     packageJson.devDependencies?.['bumba-cli']),
        dependencies: packageJson.dependencies || {}
      };
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Detect existing BUMBA configuration
   */
  async detectBumbaConfig() {
    try {
      const content = await fs.readFile(this.paths.bumbaConfig, 'utf8');
      const config = JSON.parse(content);
      
      this.detected.bumbaConfig = {
        path: this.paths.bumbaConfig,
        version: config.version,
        setupCompleted: config.metadata?.setupCompleted || false,
        lastUpdated: config.metadata?.lastUpdated,
        config
      };
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Analyze detection results
   */
  analyzeDetection() {
    const summary = {
      hasEnvFile: !!this.detected.envFile,
      hasAPIKeys: this.detected.existingKeys.length > 0,
      hasMCPConfig: !!this.detected.mcpConfig,
      hasMCPServers: this.detected.mcpServers.length > 0,
      hasGitignore: !!this.detected.gitignore,
      isGitignoreConfigured: this.detected.gitignore?.hasEnv || false,
      hasPackageJson: !!this.detected.packageJson,
      isBumbaProject: this.detected.packageJson?.hasBumba || false,
      hasBumbaConfig: !!this.detected.bumbaConfig,
      isSetupComplete: this.detected.bumbaConfig?.setupCompleted || false,
      
      // Counts
      apiKeyCount: this.detected.existingKeys.length,
      mcpServerCount: this.detected.mcpServers.length,
      
      // Recommendations
      recommendations: []
    };
    
    // Generate recommendations
    if (!summary.hasEnvFile) {
      summary.recommendations.push('Create .env file for API keys');
    }
    
    if (!summary.hasAPIKeys) {
      summary.recommendations.push('Configure at least one AI API key');
    }
    
    if (!summary.hasMCPConfig && this.paths.mcpConfig) {
      summary.recommendations.push('Configure MCP servers for Claude');
    }
    
    if (!summary.isGitignoreConfigured) {
      summary.recommendations.push('Add .env to .gitignore for security');
    }
    
    if (summary.hasAPIKeys && !summary.hasMCPServers) {
      summary.recommendations.push('Set up MCP servers to enable tool access');
    }
    
    return summary;
  }

  /**
   * Get detection report
   */
  getReport() {
    const summary = this.analyzeDetection();
    
    return {
      platform: this.paths.platform,
      projectRoot: this.options.projectRoot,
      detected: {
        envFile: this.detected.envFile || 'Not found',
        mcpConfig: this.detected.mcpConfig || 'Not found',
        apiKeys: this.detected.existingKeys.map(k => `${k.provider}: ${k.value}`),
        mcpServers: this.detected.mcpServers.map(s => s.name)
      },
      summary,
      recommendations: summary.recommendations
    };
  }
}

module.exports = ConfigDetector;