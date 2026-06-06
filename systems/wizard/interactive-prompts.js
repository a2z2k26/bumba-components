/**
 * Interactive Prompts for BUMBA Setup Wizard
 * Handles all user interactions with validation and formatting
 */

const CLIInterface = require('./cli-interface');
const chalk = require('chalk');

class InteractivePrompts {
  constructor(options = {}) {
    this.cli = new CLIInterface(options);
    this.options = options;

    // Prompt templates
    this.templates = {
      apiKeys: this.getAPIKeyTemplates(),
      mcpServers: this.getMCPServerTemplates(),
      bridge: this.getBridgeTemplates(),
      confirmation: this.getConfirmationTemplates()
    };

    // Validation rules
    this.validators = {
      apiKey: this.getAPIKeyValidators(),
      url: this.getURLValidators(),
      port: this.getPortValidators()
    };
  }

  /**
   * Get API key prompt templates
   */
  getAPIKeyTemplates() {
    return {
      openai: {
        message: 'OpenAI API Key',
        hint: 'Get from: https://platform.openai.com/api-keys',
        validator: this.validators.apiKey.openai,
        mask: true
      },
      anthropic: {
        message: 'Anthropic (Claude) API Key',
        hint: 'Get from: https://console.anthropic.com/settings/keys',
        validator: this.validators.apiKey.anthropic,
        mask: true
      },
      google: {
        message: 'Google AI (Gemini) API Key',
        hint: 'Get from: https://makersuite.google.com/app/apikey',
        validator: this.validators.apiKey.google,
        mask: true
      },
      openrouter: {
        message: 'OpenRouter API Key (200+ models)',
        hint: 'Get from: https://openrouter.ai/keys',
        validator: this.validators.apiKey.openrouter,
        mask: true
      },
      github: {
        message: 'GitHub Personal Access Token',
        hint: 'Get from: https://github.com/settings/tokens',
        validator: this.validators.apiKey.github,
        mask: true
      },
      notion: {
        message: 'Notion API Key',
        hint: 'Get from: https://www.notion.so/my-integrations',
        validator: this.validators.apiKey.notion,
        mask: true
      },
      pinecone: {
        message: 'Pinecone API Key',
        hint: 'Get from: https://app.pinecone.io/organizations',
        validator: this.validators.apiKey.pinecone,
        mask: true
      }
    };
  }

  /**
   * Get MCP server prompt templates
   */
  getMCPServerTemplates() {
    return {
      filesystem: {
        name: 'Filesystem',
        description: 'File read/write operations',
        command: 'npx -y @modelcontextprotocol/server-filesystem',
        required: true
      },
      memory: {
        name: 'Memory',
        description: 'Persistent memory and state',
        command: 'npx -y @modelcontextprotocol/server-memory',
        required: true
      },
      github: {
        name: 'GitHub',
        description: 'Repository and PR management',
        command: 'npx -y @modelcontextprotocol/server-github',
        requiresAuth: true
      },
      notion: {
        name: 'Notion',
        description: 'Database and document access',
        command: 'npx -y @modelcontextprotocol/server-notion',
        requiresAuth: true
      },
      fetch: {
        name: 'Fetch',
        description: 'HTTP requests and web scraping',
        command: 'npx -y @modelcontextprotocol/server-fetch',
        required: false
      },
      serena: {
        name: 'Serena',
        description: 'Semantic code search',
        command: 'uvx serena',
        required: false
      }
    };
  }

  /**
   * Get bridge prompt templates
   */
  getBridgeTemplates() {
    return {
      enable: {
        message: 'Enable Universal Tool Bridge?',
        description: 'Allows all AI models to access tools (not just Claude)',
        default: true
      },
      port: {
        message: 'Bridge port',
        description: 'Local port for bridge server',
        default: 3456,
        validator: this.validators.port
      },
      autoStart: {
        message: 'Auto-start bridge?',
        description: 'Start bridge automatically with BUMBA',
        default: true
      }
    };
  }

  /**
   * Get confirmation prompt templates
   */
  getConfirmationTemplates() {
    return {
      backup: {
        message: 'Create backup of existing configuration?',
        default: true
      },
      overwrite: {
        message: 'Overwrite existing configuration?',
        default: false
      },
      installDeps: {
        message: 'Install missing dependencies?',
        default: true
      },
      configureMCP: {
        message: 'Configure MCP servers for Claude?',
        default: true
      }
    };
  }

  /**
   * Get API key validators
   */
  getAPIKeyValidators() {
    return {
      openai: (value) => {
        if (!value) return 'API key is required';
        if (!value.startsWith('sk-')) return 'OpenAI keys start with "sk-"';
        if (value.length < 40) return 'Key seems too short';
        return true;
      },
      anthropic: (value) => {
        if (!value) return 'API key is required';
        if (!value.startsWith('sk-ant-')) return 'Anthropic keys start with "sk-ant-"';
        if (value.length < 90) return 'Key seems too short';
        return true;
      },
      google: (value) => {
        if (!value) return 'API key is required';
        if (value.length < 30) return 'Key seems too short';
        return true;
      },
      openrouter: (value) => {
        if (!value) return 'API key is required';
        if (!value.startsWith('sk-or-')) return 'OpenRouter keys start with "sk-or-"';
        return true;
      },
      github: (value) => {
        if (!value) return 'Token is required';
        if (!value.match(/^gh[pso]_[a-zA-Z0-9]{36}$/)) {
          return 'Invalid GitHub token format';
        }
        return true;
      },
      notion: (value) => {
        if (!value) return 'API key is required';
        if (!value.startsWith('secret_')) return 'Notion keys start with "secret_"';
        if (value.length !== 50) return 'Notion keys are 50 characters';
        return true;
      },
      pinecone: (value) => {
        if (!value) return 'API key is required';
        if (value.length < 30) return 'Key seems too short';
        return true;
      }
    };
  }

  /**
   * Get URL validators
   */
  getURLValidators() {
    return {
      http: (value) => {
        try {
          new URL(value);
          return true;
        } catch {
          return 'Invalid URL format';
        }
      },
      webhook: (value) => {
        if (!value.startsWith('http')) return 'Webhook must start with http';
        return this.validators.url.http(value);
      }
    };
  }

  /**
   * Get port validators
   */
  getPortValidators() {
    return (value) => {
      const port = parseInt(value);
      if (isNaN(port)) return 'Port must be a number';
      if (port < 1024) return 'Port must be >= 1024';
      if (port > 65535) return 'Port must be <= 65535';
      return true;
    };
  }

  /**
   * Prompt for API keys
   */
  async promptAPIKeys(existing = {}) {
    const keys = {};

    this.cli.showSection('API Key Configuration', 'Configure AI model API keys');

    // Show which providers to configure
    const providers = await this.selectProviders(existing);

    for (const provider of providers) {
      const template = this.templates.apiKeys[provider];
      if (!template) continue;

      // Skip if already configured
      if (existing[provider]) {
        const reconfigure = await this.cli.askConfirm(
          `${provider} already configured. Reconfigure?`,
          { default: false }
        );

        if (!reconfigure) {
          keys[provider] = existing[provider];
          continue;
        }
      }

      // Show hint
      if (template.hint) {
        this.cli.info(template.hint);
      }

      // Prompt for key
      const key = await this.cli.askPassword(template.message, {
        validate: template.validator
      });

      if (key && key !== 'skip') {
        keys[provider] = key;
        this.cli.success(`${provider} configured`);
      }
    }

    return keys;
  }

  /**
   * Select which providers to configure
   */
  async selectProviders(existing = {}) {
    const choices = [
      { name: ' Essential (OpenAI + Anthropic)', value: ['openai', 'anthropic'] },
      { name: ' Complete (All providers)', value: Object.keys(this.templates.apiKeys) },
      { name: ' Quick (OpenAI only)', value: ['openai'] },
      { name: ' Custom selection', value: 'custom' }
    ];

    const selection = await this.cli.askSelect(
      'Which API providers would you like to configure?',
      choices
    );

    if (selection === 'custom') {
      // Custom selection
      const providers = [];
      for (const [provider, template] of Object.entries(this.templates.apiKeys)) {
        const configure = await this.cli.askConfirm(
          `Configure ${provider}?`,
          { default: !existing[provider] }
        );

        if (configure) {
          providers.push(provider);
        }
      }
      return providers;
    }

    return selection;
  }

  /**
   * Prompt for MCP servers
   */
  async promptMCPServers(existing = []) {
    const servers = [];

    this.cli.showSection('MCP Server Configuration', 'Configure Model Context Protocol servers for Claude');

    // Check if Claude is available
    const claudeAvailable = await this.checkClaudeAvailability();
    if (!claudeAvailable) {
      this.cli.warning('Claude desktop app not detected', 'MCP servers require Claude to be installed');

      const proceed = await this.cli.askConfirm('Configure MCP servers anyway?');
      if (!proceed) return servers;
    }

    // Select servers to configure
    for (const [id, template] of Object.entries(this.templates.mcpServers)) {
      const isConfigured = existing.some(s => s.name === id);

      if (isConfigured) {
        this.cli.info(`${template.name} already configured`);
        continue;
      }

      const configure = await this.cli.askConfirm(
        `Configure ${template.name}? ${template.description}`,
        { default: template.required }
      );

      if (configure) {
        servers.push({
          name: id,
          ...template
        });
      }
    }

    return servers;
  }

  /**
   * Prompt for bridge configuration
   */
  async promptBridge(existing = {}) {
    this.cli.showSection('Universal Tool Bridge', 'Enable multi-model tool access');

    const config = {};

    // Enable bridge?
    config.enabled = await this.cli.askConfirm(
      this.templates.bridge.enable.message,
      {
        default: existing.enabled !== false
      }
    );

    if (!config.enabled) {
      return config;
    }

    // Configure port
    config.port = await this.cli.askInput(
      this.templates.bridge.port.message,
      {
        default: existing.port || this.templates.bridge.port.default,
        validate: this.templates.bridge.port.validator
      }
    );

    // Auto-start?
    config.autoStart = await this.cli.askConfirm(
      this.templates.bridge.autoStart.message,
      {
        default: existing.autoStart !== false
      }
    );

    return config;
  }

  /**
   * Check if Claude is available
   */
  async checkClaudeAvailability() {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
      const platform = process.platform;
      let command;

      if (platform === 'darwin') {
        command = 'ls /Applications | grep -i claude';
      } else if (platform === 'win32') {
        command = 'where claude';
      } else {
        command = 'which claude';
      }

      const { stdout } = await execAsync(command);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Show configuration summary
   */
  showSummary(config) {
    this.cli.showSection('Configuration Summary', 'Review your settings');

    // API Keys
    if (config.apiKeys && Object.keys(config.apiKeys).length > 0) {
      this.cli.showList('API Keys',
        Object.entries(config.apiKeys).map(([provider, key]) => ({
          name: provider,
          description: key ? ' Configured' : ' Not configured'
        }))
      );
    }

    // MCP Servers
    if (config.mcpServers && config.mcpServers.length > 0) {
      this.cli.showList('MCP Servers',
        config.mcpServers.map(s => ({
          name: s.name,
          description: s.description
        }))
      );
    }

    // Bridge
    if (config.bridge) {
      this.cli.info('Bridge Configuration',
        config.bridge.enabled ?
          `Enabled on port ${config.bridge.port}` :
          'Disabled'
      );
    }
  }
}

module.exports = InteractivePrompts;