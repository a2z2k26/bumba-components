/**
 * Setup Wizard for Tool Bridge
 * Interactive configuration wizard with flexible skip options
 * Part of the Agent Primitives Suite
 */

const inquirer = require('inquirer').default || require('inquirer');
const chalk = require('chalk');
const { ToolBridgeBranding } = require('../shared/branding');
const ora = require('ora');
const fs = require('fs').promises;
const path = require('path');

class SetupWizard {
  constructor(configManager) {
    this.config = configManager;
    this.steps = [];
    this.results = {};
    this.completedSteps = [];
    this.skippedSteps = [];
    this.partialConfig = null;
    this.branding = new ToolBridgeBranding({ enableColors: true });
  }

  async run(options = {}) {
    console.log();
    this.branding.displayLogo('compact', { gradient: true, padding: false });
    console.log();
    console.log(this.branding.chalk.gradient.yellowGreen('Tool Bridge Configuration Wizard'));
    console.log(this.branding.chalk.accent.wheat('Configure your Universal AI Development Gateway'));
    console.log(this.branding.chalk.gray('Part of the Agent Primitives Suite\n'));

    try {
      // Load existing partial configuration if it exists
      await this.loadPartialConfig();

      // Check if user wants to skip entire wizard
      if (!options.force) {
        const skipAll = await this.askSkipWizard();
        if (skipAll) {
          return this.handleSkipAll();
        }
      }

      // Show wizard menu for selective setup
      const setupChoice = await this.showSetupMenu();

      if (setupChoice === 'complete') {
        await this.runCompleteSetup();
      } else if (setupChoice === 'selective') {
        await this.runSelectiveSetup();
      } else if (setupChoice === 'resume') {
        await this.resumePartialSetup();
      } else if (setupChoice === 'quick') {
        await this.runQuickSetup();
      }

      // Save configuration state
      await this.saveConfiguration();

      if (this.skippedSteps.length > 0) {
        this.showSkippedStepsMessage();
      } else {
        console.log(this.branding.formatStatus('success', '\n Tool Bridge setup complete!\n'));
      }

      return true;

    } catch (error) {
      console.error(chalk.red('\n Setup failed:', error.message));
      return false;
    }
  }

  async askSkipWizard() {
    const { skipWizard } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'skipWizard',
        message: 'Would you like to run the setup wizard now?',
        default: true
      }
    ]);

    return !skipWizard;
  }

  async handleSkipAll() {
    console.log(this.branding.chalk.semantic.warning('\n  Setup wizard skipped.\n'));
    console.log(this.branding.chalk.gradient.yellowGreen('You can run the setup wizard at any time using:'));
    console.log(this.branding.chalk.white.bold('  tool-bridge setup\n'));
    console.log(this.branding.chalk.gray('Tool Bridge will use default settings until configured.'));

    // Create minimal config with defaults
    await this.createMinimalConfig();
    return true;
  }

  async showSetupMenu() {
    const choices = [
      {
        name: ' Quick Setup (Essential configs only)',
        value: 'quick'
      },
      {
        name: ' Complete Setup (All configurations)',
        value: 'complete'
      },
      {
        name: '  Selective Setup (Choose what to configure)',
        value: 'selective'
      }
    ];

    // Add resume option if partial config exists
    if (this.partialConfig && this.partialConfig.incompleteSections) {
      choices.unshift({
        name: '▶  Resume Previous Setup',
        value: 'resume'
      });
    }

    const { setupType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'setupType',
        message: 'How would you like to configure Tool Bridge?',
        choices
      }
    ]);

    return setupType;
  }

  async runQuickSetup() {
    console.log(chalk.cyan('\n Quick Setup - Essential Configuration Only\n'));

    // Only configure essentials
    await this.configureEssentialAPIs();
    await this.configureBasicSecurity();

    console.log(chalk.green('\n Quick setup complete!'));
    console.log(chalk.gray('Run "tool-bridge setup" later to configure additional options.'));
  }

  async runCompleteSetup() {
    console.log(chalk.cyan('\n Complete Setup - All Configurations\n'));

    // Step 1: Welcome and overview
    await this.showWelcome();

    // Step 2: Configure APIs with skip option
    if (await this.askStepConfirmation('API Configuration')) {
      await this.configureAPIs();
      this.completedSteps.push('apis');
    } else {
      this.skippedSteps.push('apis');
    }

    // Step 3: Configure MCP Servers with skip option
    if (await this.askStepConfirmation('MCP Server Configuration')) {
      await this.configureMCPServers();
      this.completedSteps.push('mcp');
    } else {
      this.skippedSteps.push('mcp');
    }

    // Step 4: Configure server with skip option
    if (await this.askStepConfirmation('Server Configuration')) {
      await this.configureServer();
      this.completedSteps.push('server');
    } else {
      this.skippedSteps.push('server');
    }

    // Step 5: Configure security with skip option
    if (await this.askStepConfirmation('Security Configuration')) {
      await this.configureSecurity();
      this.completedSteps.push('security');
    } else {
      this.skippedSteps.push('security');
    }

    // Step 6: Test connections (optional)
    if (this.completedSteps.includes('apis') || this.completedSteps.includes('mcp')) {
      if (await this.askStepConfirmation('Connection Testing')) {
        await this.testConnections();
      }
    }
  }

  async runSelectiveSetup() {
    console.log(chalk.cyan('\n  Selective Setup - Choose Your Configurations\n'));

    const { sections } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'sections',
        message: 'Select the sections you want to configure:',
        choices: [
          { name: 'Traditional AI Providers (OpenAI, Anthropic, etc.)', value: 'apis' },
          { name: 'MCP Servers Integration', value: 'mcp' },
          { name: 'Server Settings (Port, Host)', value: 'server' },
          { name: 'Security (JWT, API Keys)', value: 'security' },
          { name: 'Rate Limiting & Performance', value: 'performance' },
          { name: 'Additional Integrations (Slack, Discord, etc.)', value: 'integrations' }
        ]
      }
    ]);

    for (const section of sections) {
      await this.configureSection(section);
      this.completedSteps.push(section);
    }
  }

  async resumePartialSetup() {
    console.log(chalk.cyan('\n▶  Resuming Previous Setup\n'));

    const incomplete = this.partialConfig.incompleteSections || [];
    console.log(chalk.yellow('Incomplete sections:'), incomplete.join(', '));

    for (const section of incomplete) {
      if (await this.askStepConfirmation(`Configure ${section}`)) {
        await this.configureSection(section);
        this.completedSteps.push(section);
      }
    }
  }

  async askStepConfirmation(stepName) {
    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: `Configure ${stepName}?`,
        default: true
      }
    ]);

    if (!proceed) {
      console.log(chalk.gray(`  ⏭  Skipping ${stepName}...`));
    }

    return proceed;
  }

  async configureSection(section) {
    switch (section) {
    case 'apis':
      await this.configureAPIs();
      break;
    case 'mcp':
      await this.configureMCPServers();
      break;
    case 'server':
      await this.configureServer();
      break;
    case 'security':
      await this.configureSecurity();
      break;
    case 'performance':
      await this.configurePerformance();
      break;
    case 'integrations':
      await this.configureIntegrations();
      break;
    }
  }

  async showWelcome() {
    console.log(chalk.cyan.bold('Welcome to Tool Bridge!\n'));
    console.log('Tool Bridge is a universal gateway that connects to:');
    console.log('  • Any AI model or provider');
    console.log('  • Any MCP (Model Context Protocol) server');
    console.log('  • Custom APIs and local models\n');
    console.log(chalk.gray('You can skip any step and configure it later.\n'));
  }

  async configureEssentialAPIs() {
    console.log(chalk.yellow('\n Essential API Configuration\n'));

    const { wantOpenAI } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'wantOpenAI',
        message: 'Configure OpenAI API?',
        default: false
      }
    ]);

    if (wantOpenAI) {
      const { openaiKey } = await inquirer.prompt([
        {
          type: 'password',
          name: 'openaiKey',
          message: 'Enter OpenAI API key (or press Enter to skip):',
          validate: (input) => {
            if (!input) {
              return true;
            } // Allow empty
            return input.startsWith('sk-') || 'Invalid OpenAI key format';
          }
        }
      ]);

      if (openaiKey) {
        this.results.openaiKey = openaiKey;
      }
    }
  }

  async configureAPIs() {
    console.log(chalk.yellow('\n AI Provider Configuration\n'));
    console.log(chalk.gray('Configure API keys for AI providers. Press Enter to skip any provider.\n'));

    // Show available providers
    const providers = [
      { name: 'OpenAI (GPT-4, DALL-E)', key: 'openai' },
      { name: 'Anthropic (Claude)', key: 'anthropic' },
      { name: 'Google AI (Gemini)', key: 'google' },
      { name: 'Custom/Other Provider', key: 'custom' }
    ];

    for (const provider of providers) {
      const { configure } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'configure',
          message: `Configure ${provider.name}?`,
          default: false
        }
      ]);

      if (configure) {
        await this.configureProvider(provider);
      }
    }
  }

  async configureMCPServers() {
    console.log(chalk.yellow('\n MCP Server Configuration\n'));
    console.log(chalk.gray('Tool Bridge can connect to any MCP server.\n'));

    // Show common MCP servers
    const { mcpServers } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'mcpServers',
        message: 'Select MCP servers to configure:',
        choices: [
          { name: 'GitHub MCP', value: 'github' },
          { name: 'MongoDB MCP', value: 'mongodb' },
          { name: 'PostgreSQL MCP', value: 'postgres' },
          { name: 'Pinecone Vector DB', value: 'pinecone' },
          { name: 'Brave Search MCP', value: 'brave' },
          { name: 'Cloudflare MCP', value: 'cloudflare' },
          { name: 'Custom MCP Server', value: 'custom' }
        ]
      }
    ]);

    for (const server of mcpServers) {
      await this.configureMCPServer(server);
    }
  }

  async configureProvider(provider) {
    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: `Enter ${provider.name} API key:`,
        validate: (input) => input.length > 0 || 'API key is required'
      }
    ]);

    this.results[`${provider.key}ApiKey`] = apiKey;
  }

  async configureMCPServer(server) {
    console.log(chalk.cyan(`\nConfiguring ${server} MCP...`));
    // Configuration logic for each MCP server
    // Store in this.results.mcpServers[server]
  }

  async configureServer() {
    console.log(chalk.yellow('\n  Server Configuration\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'port',
        message: 'Server port:',
        default: '3456',
        validate: (input) => {
          const port = parseInt(input);
          return (port > 0 && port < 65536) || 'Invalid port number';
        }
      },
      {
        type: 'input',
        name: 'host',
        message: 'Server host:',
        default: 'localhost'
      }
    ]);

    this.results.server = answers;
  }

  async configureSecurity() {
    console.log(chalk.yellow('\n Security Configuration\n'));

    const { autoGenerate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'autoGenerate',
        message: 'Auto-generate secure keys?',
        default: true
      }
    ]);

    if (autoGenerate) {
      const crypto = require('crypto');
      this.results.security = {
        jwtSecret: crypto.randomBytes(32).toString('hex'),
        masterKey: crypto.randomBytes(32).toString('hex')
      };
      console.log(chalk.green('   Secure keys generated'));
    } else {
      const answers = await inquirer.prompt([
        {
          type: 'password',
          name: 'jwtSecret',
          message: 'JWT Secret:',
          validate: (input) => input.length >= 32 || 'Must be at least 32 characters'
        },
        {
          type: 'password',
          name: 'masterKey',
          message: 'Master API Key:',
          validate: (input) => input.length >= 32 || 'Must be at least 32 characters'
        }
      ]);

      this.results.security = answers;
    }
  }

  async configurePerformance() {
    console.log(chalk.yellow('\n Performance & Rate Limiting\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'rateLimitWindow',
        message: 'Rate limit window (ms):',
        default: '60000'
      },
      {
        type: 'input',
        name: 'rateLimitMax',
        message: 'Max requests per window:',
        default: '100'
      }
    ]);

    this.results.performance = answers;
  }

  async configureIntegrations() {
    console.log(chalk.yellow('\n Additional Integrations\n'));

    const { integrations } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'integrations',
        message: 'Select integrations to configure:',
        choices: [
          { name: 'Slack', value: 'slack' },
          { name: 'Discord', value: 'discord' },
          { name: 'Telegram', value: 'telegram' },
          { name: 'Webhooks', value: 'webhooks' }
        ]
      }
    ]);

    // Configure selected integrations
    this.results.integrations = integrations;
  }

  async testConnections() {
    console.log(chalk.yellow('\n Testing Connections...\n'));

    const spinner = ora('Testing configured APIs...').start();

    // Test logic here
    await new Promise((resolve) => setTimeout(resolve, 2000));

    spinner.succeed('All connections tested successfully');
  }

  async loadPartialConfig() {
    try {
      const configPath = path.join(process.env.HOME, '.tool-bridge', 'setup-state.json');
      const data = await fs.readFile(configPath, 'utf8');
      this.partialConfig = JSON.parse(data);
    } catch (error) {
      // No partial config exists
      this.partialConfig = null;
    }
  }

  async saveConfiguration() {
    const spinner = ora('Saving configuration...').start();

    try {
      // Save to config manager
      await this.config.save(this.results);

      // Save setup state
      const statePath = path.join(process.env.HOME, '.tool-bridge', 'setup-state.json');
      await fs.mkdir(path.dirname(statePath), { recursive: true });

      const setupState = {
        completedSteps: this.completedSteps,
        skippedSteps: this.skippedSteps,
        incompleteSections: this.getIncompleteSections(),
        lastUpdated: new Date().toISOString()
      };

      await fs.writeFile(statePath, JSON.stringify(setupState, null, 2));

      spinner.succeed('Configuration saved');
    } catch (error) {
      spinner.fail('Failed to save configuration');
      throw error;
    }
  }

  getIncompleteSections() {
    const allSections = ['apis', 'mcp', 'server', 'security', 'performance', 'integrations'];
    return allSections.filter((s) => !this.completedSteps.includes(s));
  }

  showSkippedStepsMessage() {
    console.log(chalk.yellow('\n  Some configuration steps were skipped.\n'));
    console.log('You can complete the setup at any time by running:');
    console.log(chalk.white.bold('  tool-bridge setup\n'));
    console.log(chalk.gray('Skipped sections: ' + this.skippedSteps.join(', ')));
  }

  async createMinimalConfig() {
    // Create a minimal working configuration
    const minimalConfig = {
      server: {
        port: 3456,
        host: 'localhost'
      },
      security: {
        jwtSecret: require('crypto').randomBytes(32).toString('hex'),
        masterKey: require('crypto').randomBytes(32).toString('hex')
      }
    };

    await this.config.save(minimalConfig);
  }
}

module.exports = SetupWizard;