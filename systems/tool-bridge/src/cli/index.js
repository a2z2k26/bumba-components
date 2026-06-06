#!/usr/bin/env node

/**
 * Tool Bridge CLI
 * Unified command-line interface for setup and management
 */

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const ToolBridge = require('../index');
const { version } = require('../../package.json');
const { ToolBridgeBranding } = require('../shared/branding');

const program = new Command();
const toolBridge = new ToolBridge();
const branding = new ToolBridgeBranding({ enableColors: true });

// Show Tool Bridge banner with BUMBA branding
const showBanner = () => {
  branding.displayLogo('main', { gradient: true, padding: false });
  console.log(branding.chalk.accent.gold('▄'.repeat(62)));
  console.log(branding.chalk.accent.gold.bold(' Tool Bridge - Universal AI Development Gateway '));
  console.log(branding.chalk.accent.gold('▀'.repeat(62)));
  console.log();
  console.log(branding.chalk.accent.wheat('Part of the Agent Primitives Suite'));
  console.log(branding.chalk.accent.wheat('Professional • Intelligent • Secure • Enterprise-Ready'));
  console.log();
};

// Main program configuration
program
  .name('tool-bridge')
  .description('Tool Bridge - The Universal AI Development Gateway')
  .version(version);

// Start command - the default action
program
  .command('start')
  .description('Start the Tool Bridge server')
  .option('-p, --port <port>', 'Port to listen on', '3456')
  .option('-h, --host <host>', 'Host to bind to', 'localhost')
  .option('--setup', 'Run setup wizard if not configured')
  .option('--force', 'Start even with validation warnings')
  .action(async (options) => {
    showBanner();
    const spinner = ora('Starting Tool Bridge...').start();

    try {
      await toolBridge.initialize({
        force: options.force,
        port: options.port,
        host: options.host
      });

      const _server = await toolBridge.start();
      spinner.succeed(branding.chalk.gradient.green(`Tool Bridge running at http://${options.host}:${options.port}`));

      console.log(chalk.gray('\nPress Ctrl+C to stop the server'));

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log(chalk.yellow('\n\nShutting down Tool Bridge...'));
        await toolBridge.stop();
        process.exit(0);
      });

    } catch (error) {
      spinner.fail(chalk.red('Failed to start Tool Bridge'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Setup command
program
  .command('setup')
  .description('Run the configuration wizard')
  .option('--reset', 'Reset all configuration')
  .action(async (options) => {
    showBanner();
    console.log(branding.chalk.gradient.yellowGreen('Starting Tool Bridge Setup Wizard...\n'));

    try {
      if (options.reset) {
        const ConfigManager = require('../shared/config-manager');
        const config = new ConfigManager();
        await config.reset();
        console.log(chalk.yellow('Configuration reset.\n'));
      }

      await toolBridge.initialize({
        setupOnly: true,
        forceSetup: true
      });

      console.log(branding.formatStatus('success', '\nTool Bridge Setup complete!'));
      console.log(branding.chalk.gray('Run "tool-bridge start" to start the server'));

    } catch (error) {
      console.error(chalk.red('Setup failed:', error.message));
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show current status and configuration')
  .action(async () => {
    showBanner();

    try {
      await toolBridge.initialize({ setupOnly: true });
      const status = toolBridge.getStatus();

      console.log(branding.chalk.gradient.yellow('\n Tool Bridge Status\n'));

      // Configuration status
      console.log(chalk.white('Configuration:'),
        status.configured ? chalk.green(' Valid') : chalk.red(' Invalid'));

      // Bridge status
      console.log(chalk.white('Bridge Server:'),
        status.bridgeRunning ? chalk.green(' Running') : chalk.gray('○ Stopped'));

      // Show configured APIs
      if (status.config && status.config.apis) {
        console.log(branding.chalk.gradient.yellowGreen('\n Configured APIs:'));
        Object.entries(status.config.apis).forEach(([name, config]) => {
          const icon = config.enabled ? '' : '';
          const color = config.enabled ? chalk.green : chalk.gray;
          console.log(color(`  ${icon} ${name}`));
        });
      }

      // Show bridge details if running
      if (status.bridge) {
        console.log(branding.chalk.gradient.orangeYellow('\n Bridge Metrics:'));
        console.log(chalk.gray(`  • Uptime: ${Math.floor(status.bridge.uptime / 1000)}s`));
        console.log(chalk.gray(`  • Requests: ${status.bridge.metrics.requests}`));
        console.log(chalk.gray(`  • Errors: ${status.bridge.metrics.errors}`));
      }

    } catch (error) {
      console.error(chalk.red('Failed to get status:', error.message));
      process.exit(1);
    }
  });

// Test command
program
  .command('test')
  .description('Test all configured API connections')
  .option('--api <name>', 'Test specific API only')
  .action(async (options) => {
    showBanner();
    console.log(chalk.cyan('Testing API connections...\n'));

    const spinner = ora('Loading configuration...').start();

    try {
      await toolBridge.initialize({ setupOnly: true });
      spinner.stop();

      const APIValidator = require('../shared/api-validator');
      const validator = new APIValidator(toolBridge.config);

      const results = await validator.testAll(options.api);

      // Display results
      results.forEach((result) => {
        const icon = result.success ? '' : '';
        const color = result.success ? chalk.green : chalk.red;
        console.log(color(`${icon} ${result.name}: ${result.message}`));
        if (result.latency) {
          console.log(chalk.gray(`  Latency: ${result.latency}ms`));
        }
      });

      const allPassed = results.every((r) => r.success);
      if (allPassed) {
        console.log(chalk.green('\n All tests passed!'));
      } else {
        console.log(chalk.yellow('\n Some tests failed. Run "tool-bridge setup" to reconfigure.'));
      }

    } catch (error) {
      spinner.fail(chalk.red('Testing failed'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Config command
program
  .command('config')
  .description('Manage configuration')
  .argument('[action]', 'Action: get, set, list, edit')
  .argument('[key]', 'Configuration key')
  .argument('[value]', 'Configuration value')
  .action(async (action, key, value) => {
    try {
      const ConfigManager = require('../shared/config-manager');
      const config = new ConfigManager();
      await config.load();

      switch (action) {
      case 'get':
        if (!key) {
          console.log(JSON.stringify(config.get(), null, 2));
        } else {
          console.log(config.get(key));
        }
        break;

      case 'set':
        if (!key || value === undefined) {
          console.error(chalk.red('Usage: tool-bridge config set <key> <value>'));
          process.exit(1);
        }
        config.set(key, value);
        await config.save();
        console.log(chalk.green(` Set ${key} = ${value}`));
        break;

      case 'list': {
        const allConfig = config.get();
        Object.entries(allConfig).forEach(([k, v]) => {
          console.log(`${chalk.cyan(k)}: ${JSON.stringify(v)}`);
        });
        break;
      }

      case 'edit': {
        // Open config file in default editor
        const { exec } = require('child_process');
        const editor = process.env.EDITOR || 'nano';
        exec(`${editor} ${config.configPath}`, (error) => {
          if (error) {
            console.error(chalk.red('Failed to open editor:', error.message));
          }
        });
        break;
      }

      default:
        console.log(chalk.yellow('Actions: get, set, list, edit'));
      }

    } catch (error) {
      console.error(chalk.red('Config operation failed:', error.message));
      process.exit(1);
    }
  });

// Stop command
program
  .command('stop')
  .description('Stop the Tool Bridge server')
  .action(async () => {
    console.log(chalk.yellow('Stopping Tool Bridge...'));

    try {
      await toolBridge.stop();
      console.log(chalk.green(' Tool Bridge stopped'));
    } catch (error) {
      console.error(chalk.red('Failed to stop:', error.message));
      process.exit(1);
    }
  });

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  showBanner();
  program.outputHelp();
}