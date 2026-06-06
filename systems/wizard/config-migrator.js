/**
 * Configuration Migrator for BUMBA Setup Wizard
 * Handles migration between different configuration versions
 */

const fs = require('fs').promises;
const path = require('path');
const semver = require('semver');
const chalk = require('chalk');
const diff = require('diff');

class ConfigMigrator {
  constructor(options = {}) {
    this.options = {
      backupBeforeMigration: options.backupBeforeMigration !== false,
      validateAfterMigration: options.validateAfterMigration !== false,
      dryRun: options.dryRun || false,
      ...options
    };

    // Current version
    this.currentVersion = '2.0.0';

    // Migration definitions
    this.migrations = this.defineMigrations();

    // Migration history
    this.history = [];
  }

  /**
   * Define migration strategies
   */
  defineMigrations() {
    return [
      {
        from: '1.0.0',
        to: '1.1.0',
        description: 'Add bridge configuration support',
        migrate: async (config) => {
          if (!config.bridge) {
            config.bridge = {
              enabled: false,
              port: 3456,
              host: 'localhost',
              sessionSecret: this.generateSecret()
            };
          }
          config.version = '1.1.0';
          return config;
        }
      },
      {
        from: '1.1.0',
        to: '1.2.0',
        description: 'Restructure API keys format',
        migrate: async (config) => {
          // Migrate flat API keys to nested structure
          if (config.openaiKey || config.anthropicKey) {
            config.apiKeys = {
              openai: config.openaiKey,
              anthropic: config.anthropicKey,
              google: config.googleKey,
              github: config.githubToken,
              notion: config.notionKey
            };

            // Remove old fields
            delete config.openaiKey;
            delete config.anthropicKey;
            delete config.googleKey;
            delete config.githubToken;
            delete config.notionKey;
          }

          config.version = '1.2.0';
          return config;
        }
      },
      {
        from: '1.2.0',
        to: '1.3.0',
        description: 'Add MCP server configuration',
        migrate: async (config) => {
          if (!config.mcp) {
            config.mcp = {
              enabled: true,
              servers: ['filesystem', 'memory'],
              configPath: this.getMCPConfigPath()
            };
          }
          config.version = '1.3.0';
          return config;
        }
      },
      {
        from: '1.3.0',
        to: '1.4.0',
        description: 'Add telemetry and analytics settings',
        migrate: async (config) => {
          if (config.telemetry === undefined) {
            config.telemetry = {
              enabled: false,
              anonymousId: this.generateAnonymousId(),
              shareErrors: false,
              shareUsage: false
            };
          }
          config.version = '1.4.0';
          return config;
        }
      },
      {
        from: '1.4.0',
        to: '1.5.0',
        description: 'Add advanced features configuration',
        migrate: async (config) => {
          if (!config.features) {
            config.features = {
              autoUpdate: true,
              experimentalTools: false,
              customPrompts: false,
              pluginSupport: false
            };
          }
          config.version = '1.5.0';
          return config;
        }
      },
      {
        from: '1.5.0',
        to: '2.0.0',
        description: 'Major restructure for modular architecture',
        migrate: async (config) => {
          // Restructure into modules
          const newConfig = {
            version: '2.0.0',
            metadata: {
              installedAt: config.installedAt || new Date().toISOString(),
              lastUpdated: new Date().toISOString(),
              environment: config.environment || 'production'
            },
            modules: {
              api: {
                enabled: true,
                providers: {}
              },
              mcp: config.mcp || {
                enabled: false,
                servers: []
              },
              bridge: config.bridge || {
                enabled: false
              },
              telemetry: config.telemetry || {
                enabled: false
              }
            },
            features: config.features || {},
            settings: {
              autoBackup: true,
              logLevel: config.logLevel || 'info',
              theme: config.theme || 'auto'
            }
          };

          // Migrate API keys to providers
          if (config.apiKeys) {
            Object.entries(config.apiKeys).forEach(([provider, key]) => {
              if (key) {
                newConfig.modules.api.providers[provider] = {
                  enabled: true,
                  keyConfigured: true,
                  // Don't store actual key in config
                  keyLocation: '.env'
                };
              }
            });
          }

          return newConfig;
        }
      }
    ];
  }

  /**
   * Detect configuration version
   */
  async detectVersion(config) {
    // Explicit version field
    if (config.version) {
      return config.version;
    }

    // Detect by structure
    if (config.modules) {
      return '2.0.0';
    }

    if (config.features) {
      return '1.5.0';
    }

    if (config.telemetry !== undefined) {
      return '1.4.0';
    }

    if (config.mcp) {
      return '1.3.0';
    }

    if (config.apiKeys) {
      return '1.2.0';
    }

    if (config.bridge) {
      return '1.1.0';
    }

    // Legacy format
    return '1.0.0';
  }

  /**
   * Check if migration is needed
   */
  async needsMigration(config) {
    const version = await this.detectVersion(config);
    return semver.lt(version, this.currentVersion);
  }

  /**
   * Get migration path
   */
  getMigrationPath(fromVersion, toVersion) {
    const path = [];
    let currentVersion = fromVersion;

    while (semver.lt(currentVersion, toVersion)) {
      const migration = this.migrations.find(m => m.from === currentVersion);
      if (!migration) {
        throw new Error(`No migration path from ${currentVersion}`);
      }
      path.push(migration);
      currentVersion = migration.to;
    }

    return path;
  }

  /**
   * Migrate configuration
   */
  async migrate(config, targetVersion = this.currentVersion) {
    const startVersion = await this.detectVersion(config);

    if (semver.gte(startVersion, targetVersion)) {
      return {
        success: true,
        message: 'Configuration is already up to date',
        version: startVersion
      };
    }

    console.log(chalk.cyan(`Migrating from v${startVersion} to v${targetVersion}`));

    // Get migration path
    const migrationPath = this.getMigrationPath(startVersion, targetVersion);

    if (this.options.dryRun) {
      return this.dryRunMigration(config, migrationPath);
    }

    // Create backup
    if (this.options.backupBeforeMigration) {
      await this.createBackup(config, startVersion);
    }

    // Apply migrations
    let migratedConfig = { ...config };

    for (const migration of migrationPath) {
      console.log(chalk.gray(`  Applying: ${migration.description}`));

      try {
        migratedConfig = await migration.migrate(migratedConfig);

        this.history.push({
          from: migration.from,
          to: migration.to,
          timestamp: new Date().toISOString(),
          success: true
        });
      } catch (error) {
        this.history.push({
          from: migration.from,
          to: migration.to,
          timestamp: new Date().toISOString(),
          success: false,
          error: error.message
        });

        throw new Error(`Migration failed at ${migration.from} -> ${migration.to}: ${error.message}`);
      }
    }

    // Validate migrated configuration
    if (this.options.validateAfterMigration) {
      const validation = await this.validateConfig(migratedConfig);
      if (!validation.valid) {
        throw new Error(`Migrated configuration is invalid: ${validation.errors.join(', ')}`);
      }
    }

    return {
      success: true,
      config: migratedConfig,
      fromVersion: startVersion,
      toVersion: targetVersion,
      migrations: migrationPath.length
    };
  }

  /**
   * Dry run migration
   */
  async dryRunMigration(config, migrationPath) {
    console.log(chalk.yellow('DRY RUN - No changes will be made'));
    console.log(chalk.cyan('\nMigration Plan:'));

    migrationPath.forEach((migration, index) => {
      console.log(chalk.gray(`  ${index + 1}. ${migration.from} -> ${migration.to}: ${migration.description}`));
    });

    // Simulate migration
    let simulatedConfig = { ...config };

    for (const migration of migrationPath) {
      simulatedConfig = await migration.migrate(simulatedConfig);
    }

    // Show diff
    console.log(chalk.cyan('\nConfiguration Changes:'));
    this.showDiff(config, simulatedConfig);

    return {
      success: true,
      dryRun: true,
      plan: migrationPath,
      preview: simulatedConfig
    };
  }

  /**
   * Show configuration diff
   */
  showDiff(oldConfig, newConfig) {
    const oldJson = JSON.stringify(oldConfig, null, 2);
    const newJson = JSON.stringify(newConfig, null, 2);

    const changes = diff.diffLines(oldJson, newJson);

    changes.forEach(part => {
      if (part.added) {
        console.log(chalk.green(part.value.split('\n').map(line => '+ ' + line).join('\n')));
      } else if (part.removed) {
        console.log(chalk.red(part.value.split('\n').map(line => '- ' + line).join('\n')));
      }
    });
  }

  /**
   * Rollback migration
   */
  async rollback(config, toVersion) {
    const currentVersion = await this.detectVersion(config);

    if (semver.lte(currentVersion, toVersion)) {
      throw new Error(`Cannot rollback to ${toVersion} from ${currentVersion}`);
    }

    // Find rollback migrations
    const rollbackMigrations = this.migrations
      .filter(m => semver.gt(m.to, toVersion) && semver.lte(m.from, currentVersion))
      .reverse();

    if (rollbackMigrations.length === 0) {
      throw new Error(`No rollback path to ${toVersion}`);
    }

    console.log(chalk.yellow(`Rolling back from v${currentVersion} to v${toVersion}`));

    // Apply rollback migrations
    let rolledBackConfig = { ...config };

    for (const migration of rollbackMigrations) {
      if (migration.rollback) {
        console.log(chalk.gray(`  Rolling back: ${migration.description}`));
        rolledBackConfig = await migration.rollback(rolledBackConfig);
      } else {
        console.log(chalk.yellow(`  Warning: No rollback for ${migration.description}`));
      }
    }

    rolledBackConfig.version = toVersion;

    return {
      success: true,
      config: rolledBackConfig,
      fromVersion: currentVersion,
      toVersion
    };
  }

  /**
   * Import legacy configuration
   */
  async importLegacy(legacyPath, format = 'auto') {
    const content = await fs.readFile(legacyPath, 'utf8');
    let legacyConfig;

    // Detect format
    if (format === 'auto') {
      if (legacyPath.endsWith('.json')) {
        format = 'json';
      } else if (legacyPath.endsWith('.yaml') || legacyPath.endsWith('.yml')) {
        format = 'yaml';
      } else if (legacyPath.endsWith('.toml')) {
        format = 'toml';
      } else if (legacyPath.endsWith('.env')) {
        format = 'env';
      }
    }

    // Parse based on format
    switch (format) {
      case 'json':
        legacyConfig = JSON.parse(content);
        break;

      case 'yaml':
        const yaml = require('js-yaml');
        legacyConfig = yaml.load(content);
        break;

      case 'toml':
        const toml = require('@iarna/toml');
        legacyConfig = toml.parse(content);
        break;

      case 'env':
        legacyConfig = this.parseEnvFile(content);
        break;

      default:
        throw new Error(`Unknown format: ${format}`);
    }

    // Convert to standard format
    const standardConfig = await this.convertToStandard(legacyConfig, format);

    // Migrate to current version
    return await this.migrate(standardConfig);
  }

  /**
   * Parse .env file
   */
  parseEnvFile(content) {
    const config = {
      version: '1.0.0',
      apiKeys: {}
    };

    const lines = content.split('\n');

    lines.forEach(line => {
      const match = line.match(/^([A-Z_]+)=(.+)$/);
      if (match) {
        const [, key, value] = match;

        if (key.includes('OPENAI')) {
          config.apiKeys.openai = value;
        } else if (key.includes('ANTHROPIC')) {
          config.apiKeys.anthropic = value;
        } else if (key.includes('GOOGLE')) {
          config.apiKeys.google = value;
        } else if (key.includes('GITHUB')) {
          config.apiKeys.github = value;
        } else if (key.includes('NOTION')) {
          config.apiKeys.notion = value;
        }
      }
    });

    return config;
  }

  /**
   * Convert to standard format
   */
  async convertToStandard(config, sourceFormat) {
    // Map common field names
    const fieldMappings = {
      'api_keys': 'apiKeys',
      'api-keys': 'apiKeys',
      'openai_key': 'openaiKey',
      'anthropic_key': 'anthropicKey',
      'github_token': 'githubToken'
    };

    // Apply mappings
    const standardConfig = {};

    Object.entries(config).forEach(([key, value]) => {
      const mappedKey = fieldMappings[key] || key;
      standardConfig[mappedKey] = value;
    });

    // Ensure version
    if (!standardConfig.version) {
      standardConfig.version = '1.0.0';
    }

    return standardConfig;
  }

  /**
   * Export configuration
   */
  async exportConfig(config, outputPath, format = 'json') {
    let content;

    switch (format) {
      case 'json':
        content = JSON.stringify(config, null, 2);
        break;

      case 'yaml':
        const yaml = require('js-yaml');
        content = yaml.dump(config);
        break;

      case 'toml':
        const toml = require('@iarna/toml');
        content = toml.stringify(config);
        break;

      case 'env':
        content = this.generateEnvFile(config);
        break;

      default:
        throw new Error(`Unknown format: ${format}`);
    }

    await fs.writeFile(outputPath, content, 'utf8');

    return {
      success: true,
      path: outputPath,
      format,
      size: content.length
    };
  }

  /**
   * Generate .env file content
   */
  generateEnvFile(config) {
    const lines = ['# BUMBA Configuration'];

    if (config.modules?.api?.providers) {
      lines.push('\n# API Keys');

      const providers = config.modules.api.providers;
      if (providers.openai?.enabled) {
        lines.push('OPENAI_API_KEY=your-key-here');
      }
      if (providers.anthropic?.enabled) {
        lines.push('ANTHROPIC_API_KEY=your-key-here');
      }
      if (providers.google?.enabled) {
        lines.push('GOOGLE_API_KEY=your-key-here');
      }
      if (providers.github?.enabled) {
        lines.push('GITHUB_TOKEN=your-token-here');
      }
      if (providers.notion?.enabled) {
        lines.push('NOTION_API_KEY=your-key-here');
      }
    }

    if (config.modules?.bridge?.enabled) {
      lines.push('\n# Bridge Configuration');
      lines.push(`BRIDGE_PORT=${config.modules.bridge.port || 3456}`);
      lines.push(`BRIDGE_HOST=${config.modules.bridge.host || 'localhost'}`);
    }

    return lines.join('\n');
  }

  /**
   * Validate configuration
   */
  async validateConfig(config) {
    const errors = [];
    const warnings = [];

    // Check version
    if (!config.version) {
      errors.push('Missing version field');
    }

    // Check required fields for v2.0.0
    if (config.version === '2.0.0') {
      if (!config.modules) {
        errors.push('Missing modules field');
      }

      if (!config.metadata) {
        warnings.push('Missing metadata field');
      }
    }

    // Check for deprecated fields
    const deprecatedFields = ['openaiKey', 'anthropicKey', 'googleKey'];
    deprecatedFields.forEach(field => {
      if (config[field]) {
        warnings.push(`Deprecated field: ${field}`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create backup before migration
   */
  async createBackup(config, version) {
    const backupDir = path.join(process.cwd(), '.bumba', 'migration-backups');
    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `config-v${version}-${timestamp}.json`);

    await fs.writeFile(
      backupPath,
      JSON.stringify(config, null, 2),
      'utf8'
    );

    console.log(chalk.gray(`  Backup created: ${backupPath}`));

    return backupPath;
  }

  /**
   * Get MCP config path
   */
  getMCPConfigPath() {
    const platform = process.platform;
    const os = require('os');
    const homeDir = os.homedir();

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
   * Generate secret
   */
  generateSecret() {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate anonymous ID
   */
  generateAnonymousId() {
    const crypto = require('crypto');
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Get migration history
   */
  getHistory() {
    return this.history;
  }
}

module.exports = ConfigMigrator;