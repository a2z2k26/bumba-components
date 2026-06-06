/**
 * Environment File Writer for BUMBA Setup Wizard
 * Handles .env file creation, backup, and gitignore management
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class EnvFileWriter {
  constructor(options = {}) {
    this.options = {
      envPath: options.envPath || path.join(process.cwd(), '.env'),
      backupDir: options.backupDir || path.join(process.cwd(), '.bumba', 'backups'),
      createBackup: options.createBackup !== false,
      updateGitignore: options.updateGitignore !== false,
      preserveComments: options.preserveComments !== false,
      ...options
    };

    // Tracking
    this.existingContent = null;
    this.backupPath = null;
    this.changes = [];
  }

  /**
   * Write complete configuration to .env file
   */
  async writeEnvFile(config) {
    try {
      // Create backup if file exists
      if (this.options.createBackup) {
        await this.createBackup();
      }

      // Load existing content
      await this.loadExisting();

      // Generate new content
      const content = this.generateEnvContent(config);

      // Write to file
      await fs.writeFile(this.options.envPath, content, 'utf8');

      // Update .gitignore
      if (this.options.updateGitignore) {
        await this.updateGitignore();
      }

      // Set file permissions (Unix-like systems)
      if (process.platform !== 'win32') {
        await fs.chmod(this.options.envPath, 0o600);
      }

      return {
        success: true,
        path: this.options.envPath,
        backup: this.backupPath,
        changes: this.changes
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Load existing .env content
   */
  async loadExisting() {
    try {
      this.existingContent = await fs.readFile(this.options.envPath, 'utf8');
      return this.parseEnv(this.existingContent);
    } catch (error) {
      // File doesn't exist
      this.existingContent = null;
      return {};
    }
  }

  /**
   * Parse .env content
   */
  parseEnv(content) {
    const env = {};
    const lines = content.split('\n');

    for (const line of lines) {
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
   * Generate .env file content
   */
  generateEnvContent(config) {
    const lines = [];
    const timestamp = new Date().toISOString();

    // Header
    lines.push('# ================================================');
    lines.push('# BUMBA Framework Configuration');
    lines.push(`# Generated: ${timestamp}`);
    lines.push('# ================================================');
    lines.push('');

    // Environment
    lines.push('# Environment Settings');
    lines.push(`BUMBA_ENV=${config.environment || 'development'}`);
    lines.push('');

    // AI Model API Keys
    if (config.apiKeys && Object.keys(config.apiKeys).length > 0) {
      lines.push('# ================================================');
      lines.push('# AI Model API Keys');
      lines.push('# ================================================');
      lines.push('');

      // OpenAI
      if (config.apiKeys.openai) {
        lines.push('# OpenAI - GPT-4, GPT-3.5');
        lines.push('# Get key: https://platform.openai.com/api-keys');
        lines.push(`OPENAI_API_KEY=${config.apiKeys.openai}`);
        lines.push('');
        this.changes.push('Added OpenAI API key');
      }

      // Anthropic
      if (config.apiKeys.anthropic) {
        lines.push('# Anthropic - Claude 3 Opus, Sonnet, Haiku');
        lines.push('# Get key: https://console.anthropic.com/settings/keys');
        lines.push(`ANTHROPIC_API_KEY=${config.apiKeys.anthropic}`);
        lines.push(`CLAUDE_API_KEY=${config.apiKeys.anthropic} # Alias`);
        lines.push('');
        this.changes.push('Added Anthropic API key');
      }

      // Google
      if (config.apiKeys.google) {
        lines.push('# Google AI - Gemini Pro, Gemini Vision');
        lines.push('# Get key: https://makersuite.google.com/app/apikey');
        lines.push(`GOOGLE_API_KEY=${config.apiKeys.google}`);
        lines.push(`GEMINI_API_KEY=${config.apiKeys.google} # Alias`);
        lines.push('');
        this.changes.push('Added Google AI API key');
      }

      // OpenRouter
      if (config.apiKeys.openrouter) {
        lines.push('# OpenRouter - Access to 200+ AI models');
        lines.push('# Get key: https://openrouter.ai/keys');
        lines.push(`OPENROUTER_API_KEY=${config.apiKeys.openrouter}`);
        lines.push('');
        this.changes.push('Added OpenRouter API key');
      }

      // DeepSeek
      if (config.apiKeys.deepseek) {
        lines.push('# DeepSeek - Cost-effective coding model');
        lines.push(`DEEPSEEK_API_KEY=${config.apiKeys.deepseek}`);
        lines.push('');
        this.changes.push('Added DeepSeek API key');
      }

      // Qwen
      if (config.apiKeys.qwen) {
        lines.push('# Qwen - Alibaba Cloud AI model');
        lines.push(`QWEN_API_KEY=${config.apiKeys.qwen}`);
        lines.push('');
        this.changes.push('Added Qwen API key');
      }

      // Kimi
      if (config.apiKeys.kimi) {
        lines.push('# Kimi - Long context AI model');
        lines.push(`KIMI_API_KEY=${config.apiKeys.kimi}`);
        lines.push('');
        this.changes.push('Added Kimi API key');
      }
    }

    // Service APIs
    const hasServiceAPIs = config.apiKeys?.github || config.apiKeys?.notion || config.apiKeys?.pinecone;
    if (hasServiceAPIs) {
      lines.push('# ================================================');
      lines.push('# Service APIs');
      lines.push('# ================================================');
      lines.push('');

      // GitHub
      if (config.apiKeys.github) {
        lines.push('# GitHub - Repository and PR management');
        lines.push('# Create token: https://github.com/settings/tokens');
        lines.push(`GITHUB_TOKEN=${config.apiKeys.github}`);
        lines.push('');
        this.changes.push('Added GitHub token');
      }

      // Notion
      if (config.apiKeys.notion) {
        lines.push('# Notion - Database and documentation');
        lines.push('# Get key: https://www.notion.so/my-integrations');
        lines.push(`NOTION_API_KEY=${config.apiKeys.notion}`);
        if (config.notion?.workspaceId) {
          lines.push(`NOTION_WORKSPACE_ID=${config.notion.workspaceId}`);
        }
        if (config.notion?.databaseId) {
          lines.push(`NOTION_DATABASE_ID=${config.notion.databaseId}`);
        }
        lines.push('');
        this.changes.push('Added Notion API key');
      }

      // Pinecone
      if (config.apiKeys.pinecone) {
        lines.push('# Pinecone - Vector database for embeddings');
        lines.push('# Get key: https://app.pinecone.io/organizations');
        lines.push(`PINECONE_API_KEY=${config.apiKeys.pinecone}`);
        if (config.pinecone?.environment) {
          lines.push(`PINECONE_ENV=${config.pinecone.environment}`);
        }
        if (config.pinecone?.index) {
          lines.push(`PINECONE_INDEX=${config.pinecone.index}`);
        }
        lines.push('');
        this.changes.push('Added Pinecone API key');
      }
    }

    // Bridge Configuration
    if (config.bridge) {
      lines.push('# ================================================');
      lines.push('# Universal Tool Bridge');
      lines.push('# ================================================');
      lines.push('');
      lines.push(`BUMBA_BRIDGE_ENABLED=${config.bridge.enabled || false}`);
      lines.push(`BUMBA_BRIDGE_PORT=${config.bridge.port || 3456}`);
      lines.push(`BUMBA_BRIDGE_HOST=${config.bridge.host || '127.0.0.1'}`);
      if (config.bridge.autoStart) {
        lines.push(`BUMBA_BRIDGE_AUTO_START=${config.bridge.autoStart}`);
      }
      lines.push('');
      this.changes.push('Configured Universal Tool Bridge');
    }

    // BUMBA Settings
    lines.push('# ================================================');
    lines.push('# BUMBA Framework Settings');
    lines.push('# ================================================');
    lines.push('');
    lines.push(`BUMBA_DEFAULT_MODEL=${config.bumba?.defaultModel || 'gpt-4-turbo'}`);
    lines.push(`BUMBA_ENABLE_DYNAMIC_SWITCHING=${config.bumba?.enableDynamicSwitching !== false}`);
    lines.push(`BUMBA_MAX_SPECIALISTS=${config.bumba?.maxSpecialists || 10}`);
    lines.push(`BUMBA_TOKEN_LIMIT=${config.bumba?.tokenLimit || 1000000}`);
    lines.push(`BUMBA_LOG_LEVEL=${config.bumba?.logLevel || 'info'}`);
    lines.push(`BUMBA_TELEMETRY=${config.bumba?.telemetry || false}`);
    lines.push('');

    // Security Settings
    if (config.security) {
      lines.push('# ================================================');
      lines.push('# Security Settings');
      lines.push('# ================================================');
      lines.push('');
      lines.push(`BUMBA_ENCRYPT_KEYS=${config.security.encryptKeys !== false}`);
      lines.push(`BUMBA_AUDIT_LOGGING=${config.security.auditLogging !== false}`);
      lines.push(`BUMBA_BACKUP_ON_CHANGE=${config.security.backupOnChange !== false}`);
      lines.push('');
    }

    // Preserve custom variables from existing .env
    if (this.existingContent && this.options.preserveComments) {
      const existing = this.parseEnv(this.existingContent);
      const newKeys = new Set(lines.filter(l => l.includes('=')).map(l => l.split('=')[0]));

      const customVars = Object.entries(existing)
        .filter(([key]) => !newKeys.has(key))
        .filter(([key]) => !key.startsWith('BUMBA_') && !key.endsWith('_API_KEY'));

      if (customVars.length > 0) {
        lines.push('# ================================================');
        lines.push('# Custom Variables (Preserved)');
        lines.push('# ================================================');
        lines.push('');

        for (const [key, value] of customVars) {
          lines.push(`${key}=${value}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Create backup of existing .env file
   */
  async createBackup() {
    if (!this.existingContent) {
      try {
        this.existingContent = await fs.readFile(this.options.envPath, 'utf8');
      } catch (error) {
        // No existing file to backup
        return null;
      }
    }

    // Create backup directory
    await fs.mkdir(this.options.backupDir, { recursive: true });

    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const hash = crypto.createHash('md5').update(this.existingContent).digest('hex').substring(0, 6);
    const backupFilename = `env-backup-${timestamp}-${hash}.bak`;
    this.backupPath = path.join(this.options.backupDir, backupFilename);

    // Write backup
    await fs.writeFile(this.backupPath, this.existingContent, 'utf8');

    // Keep only last 10 backups
    await this.cleanOldBackups();

    return this.backupPath;
  }

  /**
   * Clean old backup files
   */
  async cleanOldBackups() {
    try {
      const files = await fs.readdir(this.options.backupDir);
      const backupFiles = files
        .filter(f => f.startsWith('env-backup-'))
        .map(f => ({
          name: f,
          path: path.join(this.options.backupDir, f)
        }));

      // Sort by modification time
      const stats = await Promise.all(
        backupFiles.map(async (f) => ({
          ...f,
          mtime: (await fs.stat(f.path)).mtime
        }))
      );

      stats.sort((a, b) => b.mtime - a.mtime);

      // Remove old backups (keep 10)
      const toRemove = stats.slice(10);
      for (const file of toRemove) {
        await fs.unlink(file.path);
      }
    } catch (error) {
      // Ignore errors in cleanup
    }
  }

  /**
   * Update .gitignore to include .env files
   */
  async updateGitignore() {
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    const entriesToAdd = [
      '.env',
      '.env.local',
      '.env.*.local',
      '.bumba/.key',
      '.bumba/backups/'
    ];

    try {
      // Read existing .gitignore
      let content = '';
      try {
        content = await fs.readFile(gitignorePath, 'utf8');
      } catch (error) {
        // .gitignore doesn't exist
      }

      // Check which entries are missing
      const lines = content.split('\n');
      const missing = entriesToAdd.filter(entry =>
        !lines.some(line => line.trim() === entry)
      );

      if (missing.length === 0) {
        return; // All entries already present
      }

      // Add missing entries
      const newLines = [...lines];

      // Add section if not exists
      if (!lines.some(line => line.includes('BUMBA'))) {
        newLines.push('');
        newLines.push('# BUMBA Configuration');
        newLines.push(...missing);
      } else {
        // Add to existing section
        const bumbaIndex = lines.findIndex(line => line.includes('BUMBA'));
        missing.forEach((entry, i) => {
          newLines.splice(bumbaIndex + i + 1, 0, entry);
        });
      }

      // Write updated .gitignore
      await fs.writeFile(gitignorePath, newLines.join('\n'), 'utf8');

      this.changes.push('Updated .gitignore');
    } catch (error) {
      console.error('Warning: Could not update .gitignore:', error.message);
    }
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup(backupPath) {
    try {
      const content = await fs.readFile(backupPath, 'utf8');
      await fs.writeFile(this.options.envPath, content, 'utf8');

      return {
        success: true,
        restored: backupPath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * List available backups
   */
  async listBackups() {
    try {
      const files = await fs.readdir(this.options.backupDir);
      const backups = await Promise.all(
        files
          .filter(f => f.startsWith('env-backup-'))
          .map(async (f) => {
            const fullPath = path.join(this.options.backupDir, f);
            const stats = await fs.stat(fullPath);
            return {
              filename: f,
              path: fullPath,
              size: stats.size,
              created: stats.mtime
            };
          })
      );

      return backups.sort((a, b) => b.created - a.created);
    } catch (error) {
      return [];
    }
  }
}

module.exports = EnvFileWriter;