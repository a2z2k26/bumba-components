/**
 * Tool Bridge - Main Entry Point
 * The Universal AI Development Gateway
 * Part of the Agent Primitives Suite
 */

const ToolBridgeServer = require('./bridge/server');
const SetupWizard = require('./wizard');
const ConfigManager = require('./shared/config-manager');
const { validateEnvironment } = require('./shared/validators');

class ToolBridge {
  constructor() {
    this.bridge = null;
    this.wizard = null;
    this.config = null;
  }

  async initialize(options = {}) {
    try {
      // Load or create configuration
      this.config = new ConfigManager();
      await this.config.load();

      // Check if setup is needed
      if (!this.config.isValid() || options.forceSetup) {
        const { ToolBridgeBranding } = require('./shared/branding');
        const branding = new ToolBridgeBranding();
        console.log(branding.chalk.gradient.yellowGreen('Configuration needed. Starting Tool Bridge setup wizard...'));
        this.wizard = new SetupWizard(this.config);
        await this.wizard.run();
        await this.config.save();
      }

      // Validate environment
      const validation = await validateEnvironment(this.config);
      if (!validation.isValid) {
        console.error('Environment validation failed:', validation.errors);
        if (!options.force) {
          throw new Error('Invalid environment. Run setup or use --force to continue.');
        }
      }

      // Initialize bridge server if not setup-only mode
      if (!options.setupOnly) {
        this.bridge = new ToolBridgeServer(this.config.get());
        await this.bridge.initialize();
      }

      return {
        success: true,
        config: this.config.get(),
        bridge: this.bridge,
        wizard: this.wizard
      };
    } catch (error) {
      console.error('Initialization failed:', error.message);
      throw error;
    }
  }

  async start(options = {}) {
    if (!this.bridge) {
      await this.initialize(options);
    }

    if (this.bridge) {
      return await this.bridge.start();
    }
  }

  async stop() {
    if (this.bridge) {
      return await this.bridge.stop();
    }
  }

  async reconfigure() {
    this.wizard = new SetupWizard(this.config);
    await this.wizard.run();
    await this.config.save();

    // Restart bridge if running
    if (this.bridge && this.bridge.isRunning) {
      await this.bridge.restart();
    }
  }

  getStatus() {
    return {
      configured: this.config && this.config.isValid(),
      bridgeRunning: this.bridge && this.bridge.isRunning,
      config: this.config ? this.config.getSummary() : null,
      bridge: this.bridge ? this.bridge.getStatus() : null
    };
  }
}

module.exports = ToolBridge;