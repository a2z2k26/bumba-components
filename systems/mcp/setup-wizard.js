/**
 * MCP Setup Wizard
 * Guided configuration for first-time setup
 */

const inquirer = require('inquirer');
const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
// [OPTIONAL] const { BumbaBrand } = require('../brand'); // May need @bumba/* package
// [OPTIONAL] const TemplateBuilder = require('../template/template-builder'); // May need @bumba/* package

// BUMBA color palette - smooth 6-step gradient (standardized)
const green = chalk.hex('#00FF00');        // Bright green
const lime = chalk.hex('#88FF00');         // Lime green
const yellow = chalk.hex('#FFFF00');       // Pure yellow
const amber = chalk.hex('#FFAA00');        // Amber/Golden
const orange = chalk.hex('#FF5500');       // Orange
const red = chalk.hex('#FF0000');          // Pure red
const gray = chalk.gray;
const white = chalk.white;

class MCPSetupWizard extends EventEmitter {
  constructor(registry, configLoader, sessionState) {
    super();
    this.registry = registry;
    this.configLoader = configLoader;
    this.sessionState = sessionState;

    this.steps = [
      this.welcomeStep.bind(this),
      this.profileStep.bind(this),
      this.coreServersStep.bind(this),
      this.categorySelectionStep.bind(this),
      this.authConfigStep.bind(this),
      this.preferencesStep.bind(this),
      this.confirmationStep.bind(this)
    ];

    this.config = {
      profile: null,
      coreServers: [],
      categories: [],
      authServers: {},
      preferences: {}
    };
  }

  /**
   * Launch the setup wizard
   */
  async launch() {
    console.clear();

    try {
      for (const step of this.steps) {
        const continueWizard = await step();
        if (!continueWizard) {
          console.log(yellow('\n🟡 Wizard cancelled.'));
          return false;
        }
      }

      await this.saveConfiguration();
      await this.showSuccess();
      return true;

    } catch (error) {
      console.error(red(`\n✗ Wizard error: ${error.message}`));
      return false;
    }
  }

  /**
   * Welcome step
   */
  async welcomeStep() {
    console.log(lime.bold('\n╔═══════════════════════════════════════════╗'));
    console.log(lime.bold('║   🏁 Welcome to MCP Setup Wizard 🏁      ║'));
    console.log(lime.bold('╚═══════════════════════════════════════════╝'));
    console.log();
    console.log(white('This wizard will help you configure MCP servers for BUMBA.'));
    console.log(gray('You can reconfigure at any time with: bumba mcp --setup'));
    console.log();

    const { proceed } = await inquirer.prompt({
      type: 'confirm',
      name: 'proceed',
      message: 'Ready to begin setup?',
      default: true
    });

    return proceed;
  }

  /**
   * Profile selection step
   */
  async profileStep() {
    console.log(lime('\n🟢 Step 1: Choose Your Profile\n'));

    const profiles = {
      developer: {
        name: '🟢 Developer',
        description: 'Optimized for coding with GitHub, databases, and dev tools',
        coreServers: ['memory', 'filesystem', 'github'],
        categories: ['development', 'databases', 'testing']
      },
      designer: {
        name: '🎨 Designer',
        description: 'Focused on design tools, Figma, and visual workflows',
        coreServers: ['memory', 'filesystem', 'figma'],
        categories: ['design', 'development', 'search']
      },
      data: {
        name: '📊 Data Analyst',
        description: 'Database management, search, and data processing',
        coreServers: ['memory', 'filesystem', 'postgres'],
        categories: ['databases', 'search', 'cloud']
      },
      custom: {
        name: '⚙️  Custom',
        description: 'Choose exactly which servers and features you need',
        coreServers: ['memory', 'filesystem'],
        categories: []
      }
    };

    const { profile } = await inquirer.prompt({
      type: 'list',
      name: 'profile',
      message: 'Select your profile:',
      choices: Object.entries(profiles).map(([key, prof]) => ({
        name: `${prof.name}\n    ${gray(prof.description)}`,
        value: key,
        short: prof.name
      }))
    });

    this.config.profile = profile;
    this.config.coreServers = profiles[profile].coreServers;
    this.config.categories = profiles[profile].categories;

    return true;
  }

  /**
   * Core servers configuration
   */
  async coreServersStep() {
    console.log(lime('\n🟡 Step 2: Core Servers\n'));

    const coreServers = this.registry.getServersByCategory('core');

    const { selected } = await inquirer.prompt({
      type: 'checkbox',
      name: 'selected',
      message: 'Select core servers to enable:',
      choices: coreServers.map(server => ({
        name: `${server.displayName} - ${gray(server.description)}`,
        value: server.name,
        checked: this.config.coreServers.includes(server.name)
      }))
    });

    this.config.coreServers = selected;
    return true;
  }

  /**
   * Category selection step
   */
  async categorySelectionStep() {
    if (this.config.profile !== 'custom') {
      return true; // Skip for non-custom profiles
    }

    console.log(lime('\n🟠 Step 3: Server Categories\n'));

    const categories = this.registry.getCategories();

    const { selected } = await inquirer.prompt({
      type: 'checkbox',
      name: 'selected',
      message: 'Select categories to enable:',
      choices: categories
        .filter(cat => cat.key !== 'core') // Core already handled
        .map(cat => ({
          name: `${cat.icon} ${cat.name} - ${gray(cat.description)}`,
          value: cat.key,
          checked: this.config.categories.includes(cat.key)
        }))
    });

    this.config.categories = selected;
    return true;
  }

  /**
   * Auth configuration step
   */
  async authConfigStep() {
    console.log(lime('\n🔴 Step 4: MCP Server Credentials\n'));

    // Use EnvManager for comprehensive credential handling
    // [OPTIONAL] const { getInstance: getEnvManager } = require('../../utils/env-manager'); // May need @bumba/* package
    const envManager = getEnvManager();

    // Show vital MCPs (auto-enabled, no credentials needed)
    console.log(green('✓ Vital servers (enabled by default, no credentials required):'));
    envManager.getVitalMCPs().forEach(server => {
      console.log(green(`   ● ${server}`));
    });
    console.log();

    // Get optional MCPs that require auth
    const optionalMCPs = envManager.getOptionalMCPs();
    const authRequired = optionalMCPs.filter(server => {
      const info = envManager.getCredentialInfo(server);
      return info && info.requiresAuth;
    });

    if (authRequired.length === 0) {
      console.log(gray('No optional servers require authentication.'));
      return true;
    }

    console.log(yellow('🟡 Optional servers (configure now or later):'));
    authRequired.forEach(server => {
      const info = envManager.getCredentialInfo(server);
      console.log(yellow(`   ○ ${server} - ${info.description}`));
    });
    console.log();

    const { configureNow } = await inquirer.prompt({
      type: 'confirm',
      name: 'configureNow',
      message: 'Configure optional server credentials now?',
      default: false
    });

    if (configureNow) {
      const credentials = {};

      for (const server of authRequired) {
        const info = envManager.getCredentialInfo(server);

        console.log(lime(`\n🟢 ${server}:`));
        console.log(gray(`   ${info.description}`));
        console.log(gray(`   Help: ${info.helpUrl}`));
        console.log();

        const { configure } = await inquirer.prompt({
          type: 'confirm',
          name: 'configure',
          message: `Configure ${server}?`,
          default: false
        });

        if (configure) {
          // Build prompts for each required key
          const prompts = info.keys.map(key => ({
            type: 'password',
            name: key,
            message: `${key}:`,
            mask: '*'
          }));

          const answers = await inquirer.prompt(prompts);

          // Add to credentials object
          Object.assign(credentials, answers);

          // Store in config for later saving
          this.config.authServers[server] = answers;

          console.log(green(`   ✓ ${server} credentials saved`));
        }
      }

      // Save credentials to global .env immediately
      if (Object.keys(credentials).length > 0) {
        await envManager.addCredentials(credentials, 'global');
        console.log(green('\n✓ Credentials saved to global template (~/.bumba/.env)'));
      }
    } else {
      console.log(gray('\n🟡 You can configure credentials later with: bumba mcp -i'));
      console.log(gray('   Or manually edit: ~/.bumba/.env'));
    }

    return true;
  }

  /**
   * Preferences step
   */
  async preferencesStep() {
    console.log(lime('\n🏁 Step 5: Preferences\n'));

    const { preferences } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'autoStartCore',
        message: 'Auto-start core servers on launch?',
        default: true
      },
      {
        type: 'confirm',
        name: 'stopServersOnExit',
        message: 'Stop all servers on exit?',
        default: false
      },
      {
        type: 'confirm',
        name: 'enableHealthMonitoring',
        message: 'Enable health monitoring?',
        default: true
      },
      {
        type: 'confirm',
        name: 'enableErrorRecovery',
        message: 'Enable automatic error recovery?',
        default: true
      }
    ]);

    this.config.preferences = preferences;
    return true;
  }

  /**
   * Confirmation step
   */
  async confirmationStep() {
    console.log(lime('\n✓ Step 6: Review Configuration\n'));

    console.log(white('Profile:'), this.config.profile);
    console.log(white('Core Servers:'), this.config.coreServers.join(', '));
    console.log(white('Categories:'), this.config.categories.join(', '));
    console.log(white('Preferences:'));
    Object.entries(this.config.preferences).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
    console.log();

    const { confirm } = await inquirer.prompt({
      type: 'confirm',
      name: 'confirm',
      message: 'Save this configuration?',
      default: true
    });

    return confirm;
  }

  /**
   * Get auth fields for a server
   */
  getAuthFields(serverName) {
    const fields = {
      github: [
        {
          type: 'password',
          name: 'token',
          message: 'GitHub Personal Access Token:',
          mask: '*'
        }
      ],
      postgres: [
        {
          type: 'input',
          name: 'connectionString',
          message: 'PostgreSQL connection string:',
          default: 'postgresql://localhost:5432/mydb'
        }
      ],
      mongodb: [
        {
          type: 'input',
          name: 'connectionString',
          message: 'MongoDB connection string:',
          default: 'mongodb://localhost:27017/mydb'
        }
      ],
      openai: [
        {
          type: 'password',
          name: 'apiKey',
          message: 'OpenAI API Key:',
          mask: '*'
        }
      ],
      figma: [
        {
          type: 'password',
          name: 'token',
          message: 'Figma Access Token:',
          mask: '*'
        }
      ]
    };

    return fields[serverName] || [];
  }

  /**
   * Save configuration
   */
  async saveConfiguration() {
    console.log(lime('\n🟢 Saving configuration...\n'));

    // Update session state
    this.sessionState.updatePreference('profile', this.config.profile);
    this.sessionState.updatePreference('autoStartCore', this.config.preferences.autoStartCore);
    this.sessionState.updatePreference('stopServersOnExit', this.config.preferences.stopServersOnExit);

    // Build credentials object for template
    const credentials = {};

    // Add MCP server toggles
    this.config.coreServers.forEach(server => {
      const envKey = `MCP_${server.toUpperCase()}_ENABLED`;
      credentials[envKey] = 'true';
    });

    // Add auth configurations
    for (const [server, auth] of Object.entries(this.config.authServers)) {
      for (const [key, value] of Object.entries(auth)) {
        const envKey = `MCP_${server.toUpperCase()}_${key.toUpperCase()}`;
        credentials[envKey] = value;
      }
    }

    // Check for existing .env in project
    const projectEnvPath = path.join(process.cwd(), '.env');
    let existingProjectEnv = null;
    try {
      existingProjectEnv = await fs.readFile(projectEnvPath, 'utf-8');
    } catch (error) {
      // File doesn't exist
    }

    // Check for existing global template
    const globalTemplatePath = path.join(os.homedir(), '.bumba', '.env.template');
    let existingGlobalTemplate = null;
    try {
      existingGlobalTemplate = await fs.readFile(globalTemplatePath, 'utf-8');
    } catch (error) {
      // File doesn't exist
    }

    // Build template
    const builder = new TemplateBuilder();
    builder.buildStandardTemplate(credentials);

    // Merge with existing global template if present
    if (existingGlobalTemplate) {
      const mergeResult = builder.smartMerge(existingGlobalTemplate);
      if (mergeResult.success) {
        console.log(gray('  • Merged with existing template'));
        console.log(gray(`    Preserved: ${mergeResult.report.preserved} values`));
        console.log(gray(`    Added: ${mergeResult.report.added} new keys`));
      }
    }

    // Save to global location
    await builder.saveToGlobal();
    console.log(green('  ✓ Saved global template (~/.bumba/.env.template)'));

    // Save to project location
    // If project .env exists, merge; otherwise create new
    if (existingProjectEnv) {
      // Parse existing .env and merge
      const projectBuilder = new TemplateBuilder();
      projectBuilder.buildStandardTemplate(credentials);
      projectBuilder.merge(existingProjectEnv);
      await fs.writeFile(projectEnvPath, projectBuilder.toString());
      console.log(green('  ✓ Updated project .env (preserved existing values)'));
    } else {
      // Create new .env from template
      await fs.writeFile(projectEnvPath, builder.toString());
      console.log(green('  ✓ Created project .env'));
    }

    // Save session state
    await this.sessionState.saveState();
    console.log(green('  ✓ Saved session preferences'));

    // Emit completion event with stats
    const stats = builder.getStats();
    this.emit('wizardComplete', {
      config: this.config,
      templateStats: stats
    });
  }

  /**
   * Show success message
   */
  async showSuccess() {
    console.log(green.bold('\n🏁 Setup Complete! 🏁\n'));

    console.log(white('Your MCP servers are now configured.'));
    console.log();
    console.log(lime('Quick Commands:'));
    console.log('  bumba mcp -s         # Show server status');
    console.log('  bumba mcp -d         # Launch dialog interface');
    console.log('  bumba mcp --start-core  # Start core servers');
    console.log();
    console.log(gray('You can reconfigure at any time with: bumba mcp --setup'));
  }

  /**
   * Quick setup (non-interactive)
   */
  async quickSetup(profile = 'developer') {
    console.log(lime('\n🏁 Quick Setup\n'));

    const profiles = {
      developer: {
        coreServers: ['memory', 'filesystem', 'github', 'sequential-thinking'],
        categories: ['development', 'databases', 'testing']
      },
      designer: {
        coreServers: ['memory', 'filesystem', 'figma'],
        categories: ['design', 'development', 'search']
      },
      data: {
        coreServers: ['memory', 'filesystem', 'postgres', 'mongodb'],
        categories: ['databases', 'search', 'cloud']
      }
    };

    const selected = profiles[profile] || profiles.developer;

    this.config = {
      profile,
      coreServers: selected.coreServers,
      categories: selected.categories,
      authServers: {},
      preferences: {
        autoStartCore: true,
        stopServersOnExit: false,
        enableHealthMonitoring: true,
        enableErrorRecovery: true
      }
    };

    await this.saveConfiguration();
    console.log(green(`\n✓ Quick setup complete with ${profile} profile!`));

    return true;
  }

  /**
   * Launch with global save - saves to ~/.bumba/.env
   */
  async launchWithGlobalSave() {
    // Run existing wizard flow
    const success = await this.launch();

    if (!success) {
      return false;
    }

    // Save to global location
    const os = require('os');
    const globalBumbaDir = path.join(os.homedir(), '.bumba');
    const globalEnvPath = path.join(globalBumbaDir, '.env');

    await fs.mkdir(globalBumbaDir, { recursive: true });

    // Build .env content
    const envContent = this.buildEnvContent(this.config);

    await fs.writeFile(globalEnvPath, envContent, 'utf8');

    const brand = new BumbaBrand();
    console.log(brand.wheat(`\n✓ Global configuration saved`));
    console.log(brand.grey(`  Location: ${globalEnvPath}`));
    console.log(brand.grey('  Auto-copies to new projects on "bumba init"\n'));

    return this.config;
  }

  /**
   * Build .env file content from configuration
   */
  buildEnvContent(config) {
    const lines = [
      '# BUMBA MCP Configuration',
      '# Generated by setup wizard',
      `# Created: ${new Date().toISOString()}`,
      `# Profile: ${config.profile || 'custom'}`,
      '',
      '# Vital MCPs (always enabled)',
      'MCP_FILESYSTEM_ENABLED=true',
      'MCP_MEMORY_ENABLED=true',
      'MCP_SEQUENTIAL_THINKING_ENABLED=true',
      ''
    ];

    // Add core servers
    if (config.coreServers && config.coreServers.length > 0) {
      lines.push('# Core Servers');
      config.coreServers.forEach(server => {
        lines.push(`MCP_${server.toUpperCase().replace(/-/g, '_')}_ENABLED=true`);
      });
      lines.push('');
    }

    // Add configured auth servers
    if (config.authServers && Object.keys(config.authServers).length > 0) {
      lines.push('# Authentication Credentials');
      for (const [server, auth] of Object.entries(config.authServers)) {
        lines.push(`# ${server}`);
        for (const [key, value] of Object.entries(auth)) {
          const envKey = `MCP_${server.toUpperCase()}_${key.toUpperCase()}`;
          lines.push(`${envKey}=${value}`);
        }
        lines.push('');
      }
    }

    // Add preferences
    if (config.preferences) {
      lines.push('# Preferences');
      if (config.preferences.autoStartCore !== undefined) {
        lines.push(`BUMBA_AUTO_START_CORE=${config.preferences.autoStartCore}`);
      }
      if (config.preferences.enableHealthMonitoring !== undefined) {
        lines.push(`BUMBA_HEALTH_MONITORING=${config.preferences.enableHealthMonitoring}`);
      }
      if (config.preferences.enableErrorRecovery !== undefined) {
        lines.push(`BUMBA_ERROR_RECOVERY=${config.preferences.enableErrorRecovery}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

module.exports = MCPSetupWizard;