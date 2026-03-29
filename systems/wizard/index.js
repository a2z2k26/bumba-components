/**
 * BUMBA Setup Wizard
 * Main entry point for interactive configuration
 */

const EventEmitter = require('events');
const { ConfigurationState } = require('./config-schema');
const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const fs = require('fs').promises;

class BumbaSetupWizard extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Configuration
    this.config = new ConfigurationState();
    this.options = {
      interactive: options.interactive !== false,
      verbose: options.verbose || false,
      skipBackup: options.skipBackup || false,
      configPath: options.configPath || path.join(process.cwd(), '.env'),
      mcpConfigPath: this.getMCPConfigPath(),
      ...options
    };
    
    // State management
    this.steps = [];
    this.currentStep = 0;
    this.completedSteps = new Set();
    this.errors = [];
    this.warnings = [];
    
    // Progress tracking
    this.startTime = null;
    this.endTime = null;
    
    // Initialize steps
    this.initializeSteps();
  }

  /**
   * Initialize setup steps
   */
  initializeSteps() {
    this.steps = [
      {
        id: 'welcome',
        name: 'Welcome',
        description: 'Welcome to BUMBA Setup Wizard',
        required: true,
        execute: () => this.showWelcome()
      },
      {
        id: 'detect',
        name: 'Detect Configuration',
        description: 'Detecting existing configuration',
        required: true,
        execute: () => this.detectExistingConfig()
      },
      {
        id: 'backup',
        name: 'Backup',
        description: 'Creating backup of existing configuration',
        required: false,
        execute: () => this.createBackup()
      },
      {
        id: 'api-keys',
        name: 'API Keys',
        description: 'Configure AI model API keys',
        required: true,
        execute: () => this.setupAPIKeys()
      },
      {
        id: 'mcp-servers',
        name: 'MCP Servers',
        description: 'Configure MCP servers for Claude',
        required: false,
        execute: () => this.setupMCPServers()
      },
      {
        id: 'bridge',
        name: 'Bridge',
        description: 'Configure Universal Tool Bridge',
        required: false,
        execute: () => this.setupBridge()
      },
      {
        id: 'test',
        name: 'Test Connections',
        description: 'Testing all configured connections',
        required: true,
        execute: () => this.testConnections()
      },
      {
        id: 'save',
        name: 'Save Configuration',
        description: 'Saving configuration files',
        required: true,
        execute: () => this.saveConfiguration()
      },
      {
        id: 'complete',
        name: 'Complete',
        description: 'Setup complete',
        required: true,
        execute: () => this.completeSetup()
      }
    ];
  }

  /**
   * Main execution method
   */
  async run() {
    this.startTime = Date.now();
    this.emit('start');
    
    try {
      console.log(chalk.cyan('\n🚀 BUMBA Setup Wizard\n'));
      console.log(chalk.gray('━'.repeat(50)));
      
      // Execute each step
      for (let i = 0; i < this.steps.length; i++) {
        this.currentStep = i;
        const step = this.steps[i];
        
        // Skip optional steps if configured
        if (!step.required && this.shouldSkipStep(step)) {
          continue;
        }
        
        await this.executeStep(step);
      }
      
      this.endTime = Date.now();
      this.emit('complete', this.config);
      
      return {
        success: true,
        config: this.config.config,
        duration: this.endTime - this.startTime
      };
      
    } catch (error) {
      this.emit('error', error);
      this.endTime = Date.now();
      
      return {
        success: false,
        error: error.message,
        errors: this.errors,
        warnings: this.warnings,
        duration: this.endTime - this.startTime
      };
    }
  }

  /**
   * Execute a single step
   */
  async executeStep(step) {
    const spinner = ora({
      text: step.description,
      prefixText: chalk.cyan(`[${this.currentStep + 1}/${this.steps.length}]`)
    });
    
    try {
      this.emit('step:start', step);
      
      if (this.options.verbose) {
        console.log(chalk.blue(`\n▶ ${step.name}`));
      } else {
        spinner.start();
      }
      
      await step.execute();
      
      this.completedSteps.add(step.id);
      
      if (!this.options.verbose) {
        spinner.succeed(chalk.green(step.description));
      }
      
      this.emit('step:complete', step);
      
    } catch (error) {
      if (!this.options.verbose) {
        spinner.fail(chalk.red(`${step.description} - ${error.message}`));
      } else {
        console.error(chalk.red(`✗ ${step.name}: ${error.message}`));
      }
      
      this.errors.push({
        step: step.id,
        error: error.message
      });
      
      if (step.required) {
        throw error;
      }
      
      this.emit('step:error', { step, error });
    }
  }

  /**
   * Check if step should be skipped
   */
  shouldSkipStep(step) {
    if (step.id === 'backup' && this.options.skipBackup) {
      return true;
    }
    
    if (step.id === 'mcp-servers' && !this.isClaudeEnvironment()) {
      this.warnings.push('MCP servers can only be configured in Claude environment');
      return true;
    }
    
    return false;
  }

  /**
   * Get MCP config path based on platform
   */
  getMCPConfigPath() {
    const platform = process.platform;
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    
    switch (platform) {
      case 'darwin': // macOS
        return path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
      case 'win32': // Windows
        return path.join(homeDir, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
      case 'linux': // Linux
        return path.join(homeDir, '.config', 'Claude', 'claude_desktop_config.json');
      default:
        return null;
    }
  }

  /**
   * Check if running in Claude environment
   */
  isClaudeEnvironment() {
    return process.env.CLAUDE_ENVIRONMENT === 'true' || 
           process.env.MCP_ENABLED === 'true';
  }

  /**
   * Show welcome message
   */
  async showWelcome() {
    if (!this.options.interactive) return;
    
    console.log(chalk.cyan('\nWelcome to BUMBA Setup Wizard! 🎉\n'));
    console.log('This wizard will help you configure:');
    console.log('  • AI model API keys (OpenAI, Anthropic, etc.)');
    console.log('  • MCP servers for Claude');
    console.log('  • Universal Tool Bridge for multi-model support');
    console.log('  • Testing and validation\n');
    
    console.log(chalk.yellow('Estimated time: 2-5 minutes\n'));
  }

  /**
   * Placeholder methods (to be implemented in next sprints)
   */
  async detectExistingConfig() {
    // Sprint 5 implementation
    this.emit('log', 'Detecting existing configuration...');
  }

  async createBackup() {
    // Sprint 16 implementation
    this.emit('log', 'Creating backup...');
  }

  async setupAPIKeys() {
    // Sprint 8 implementation
    this.emit('log', 'Setting up API keys...');
  }

  async setupMCPServers() {
    // Sprint 10 implementation
    this.emit('log', 'Setting up MCP servers...');
  }

  async setupBridge() {
    // Sprint 36+ implementation
    this.emit('log', 'Setting up bridge...');
  }

  async testConnections() {
    // Sprint 31 implementation
    this.emit('log', 'Testing connections...');
  }

  async saveConfiguration() {
    // Sprint 9 implementation
    this.emit('log', 'Saving configuration...');
  }

  async completeSetup() {
    console.log(chalk.green('\n✅ Setup Complete!\n'));
    
    const duration = ((this.endTime - this.startTime) / 1000).toFixed(1);
    console.log(chalk.gray(`Total time: ${duration} seconds`));
    
    if (this.warnings.length > 0) {
      console.log(chalk.yellow(`\n⚠️  Warnings: ${this.warnings.length}`));
      this.warnings.forEach(w => console.log(chalk.yellow(`  • ${w}`)));
    }
    
    console.log(chalk.cyan('\nNext steps:'));
    console.log('  1. Run: bumba test');
    console.log('  2. Start bridge: bumba bridge start');
    console.log('  3. Begin using BUMBA!\n');
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      currentStep: this.currentStep,
      totalSteps: this.steps.length,
      completedSteps: Array.from(this.completedSteps),
      errors: this.errors,
      warnings: this.warnings,
      config: this.config.config
    };
  }
}

module.exports = BumbaSetupWizard;