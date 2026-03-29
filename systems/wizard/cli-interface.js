/**
 * CLI Interface for BUMBA Setup Wizard
 * Handles user input, prompts, and display formatting
 */

const readline = require('readline');
const chalk = require('chalk');
const ora = require('ora');
const { Select, Input, Password, Confirm } = require('enquirer');

class CLIInterface {
  constructor(options = {}) {
    this.options = {
      colors: options.colors !== false,
      emoji: options.emoji !== false,
      clearScreen: options.clearScreen || false,
      ...options
    };
    
    // Readline interface for basic I/O
    this.rl = null;
    
    // Progress tracking
    this.progressBar = null;
    this.spinner = null;
    
    // Color themes
    this.theme = {
      primary: chalk.cyan,
      success: chalk.green,
      warning: chalk.yellow,
      error: chalk.red,
      info: chalk.blue,
      muted: chalk.gray,
      highlight: chalk.bold.white
    };
    
    // Emoji mappings
    this.emoji = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
      question: '❓',
      key: '🔑',
      server: '🖥️',
      bridge: '🌉',
      rocket: '🚀',
      sparkles: '✨',
      lock: '🔒',
      unlock: '🔓',
      check: '✓',
      cross: '✗',
      arrow: '→'
    };
  }

  /**
   * Initialize readline interface
   */
  init() {
    if (!this.rl) {
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true
      });
    }
    return this.rl;
  }

  /**
   * Close readline interface
   */
  close() {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  /**
   * Clear the screen
   */
  clear() {
    if (this.options.clearScreen) {
      console.clear();
    }
  }

  /**
   * Display header
   */
  showHeader(title, subtitle) {
    this.clear();
    console.log();
    console.log(this.theme.primary('═'.repeat(60)));
    console.log(this.theme.primary.bold(`  ${this.getEmoji('rocket')} ${title}`));
    if (subtitle) {
      console.log(this.theme.muted(`  ${subtitle}`));
    }
    console.log(this.theme.primary('═'.repeat(60)));
    console.log();
  }

  /**
   * Display section header
   */
  showSection(title, description) {
    console.log();
    console.log(this.theme.info('─'.repeat(50)));
    console.log(this.theme.info.bold(`  ${title}`));
    if (description) {
      console.log(this.theme.muted(`  ${description}`));
    }
    console.log(this.theme.info('─'.repeat(50)));
    console.log();
  }

  /**
   * Ask for text input
   */
  async askInput(message, options = {}) {
    const prompt = new Input({
      message: this.formatMessage(message, options.emoji || 'question'),
      initial: options.default || '',
      validate: options.validate,
      format: options.format,
      result: options.transform
    });
    
    try {
      const answer = await prompt.run();
      return answer;
    } catch (error) {
      if (error.message === 'canceled') {
        throw new Error('Setup canceled by user');
      }
      throw error;
    }
  }

  /**
   * Ask for password/secret input
   */
  async askPassword(message, options = {}) {
    const prompt = new Password({
      message: this.formatMessage(message, options.emoji || 'key'),
      validate: options.validate,
      mask: options.mask || '*'
    });
    
    try {
      const answer = await prompt.run();
      return answer;
    } catch (error) {
      if (error.message === 'canceled') {
        throw new Error('Setup canceled by user');
      }
      throw error;
    }
  }

  /**
   * Ask for confirmation
   */
  async askConfirm(message, options = {}) {
    const prompt = new Confirm({
      message: this.formatMessage(message, options.emoji || 'question'),
      initial: options.default !== false
    });
    
    try {
      const answer = await prompt.run();
      return answer;
    } catch (error) {
      if (error.message === 'canceled') {
        throw new Error('Setup canceled by user');
      }
      throw error;
    }
  }

  /**
   * Ask for selection from list
   */
  async askSelect(message, choices, options = {}) {
    const prompt = new Select({
      message: this.formatMessage(message, options.emoji || 'question'),
      choices: choices.map(choice => {
        if (typeof choice === 'string') {
          return { name: choice, value: choice };
        }
        return choice;
      }),
      initial: options.default || 0
    });
    
    try {
      const answer = await prompt.run();
      return answer;
    } catch (error) {
      if (error.message === 'canceled') {
        throw new Error('Setup canceled by user');
      }
      throw error;
    }
  }

  /**
   * Show spinner
   */
  showSpinner(text, options = {}) {
    if (this.spinner) {
      this.spinner.stop();
    }
    
    this.spinner = ora({
      text: text,
      spinner: options.spinner || 'dots',
      color: options.color || 'cyan',
      prefixText: options.prefix
    });
    
    this.spinner.start();
    return this.spinner;
  }

  /**
   * Update spinner
   */
  updateSpinner(text, type = 'text') {
    if (!this.spinner) return;
    
    switch (type) {
      case 'succeed':
        this.spinner.succeed(text);
        this.spinner = null;
        break;
      case 'fail':
        this.spinner.fail(text);
        this.spinner = null;
        break;
      case 'warn':
        this.spinner.warn(text);
        this.spinner = null;
        break;
      case 'info':
        this.spinner.info(text);
        this.spinner = null;
        break;
      default:
        this.spinner.text = text;
    }
  }

  /**
   * Show progress bar
   */
  showProgress(current, total, label = '') {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * 30);
    const empty = 30 - filled;
    
    const bar = [
      this.theme.muted('['),
      this.theme.success('█'.repeat(filled)),
      this.theme.muted('░'.repeat(empty)),
      this.theme.muted(']')
    ].join('');
    
    const progress = `${bar} ${percentage}% ${label}`;
    
    // Update in place
    process.stdout.write('\r' + progress);
    
    if (current === total) {
      process.stdout.write('\n');
    }
  }

  /**
   * Display success message
   */
  success(message, detail) {
    console.log(this.theme.success(`${this.getEmoji('success')} ${message}`));
    if (detail) {
      console.log(this.theme.muted(`   ${detail}`));
    }
  }

  /**
   * Display error message
   */
  error(message, detail) {
    console.log(this.theme.error(`${this.getEmoji('error')} ${message}`));
    if (detail) {
      console.log(this.theme.muted(`   ${detail}`));
    }
  }

  /**
   * Display warning message
   */
  warning(message, detail) {
    console.log(this.theme.warning(`${this.getEmoji('warning')} ${message}`));
    if (detail) {
      console.log(this.theme.muted(`   ${detail}`));
    }
  }

  /**
   * Display info message
   */
  info(message, detail) {
    console.log(this.theme.info(`${this.getEmoji('info')} ${message}`));
    if (detail) {
      console.log(this.theme.muted(`   ${detail}`));
    }
  }

  /**
   * Display list
   */
  showList(title, items, options = {}) {
    if (title) {
      console.log(this.theme.info.bold(title));
    }
    
    items.forEach((item, index) => {
      const bullet = options.numbered ? `${index + 1}.` : '•';
      const status = item.completed ? this.getEmoji('check') : this.getEmoji('arrow');
      
      if (item.name && item.description) {
        console.log(`  ${bullet} ${status} ${this.theme.highlight(item.name)}`);
        console.log(`      ${this.theme.muted(item.description)}`);
      } else {
        console.log(`  ${bullet} ${status} ${item}`);
      }
    });
    
    console.log();
  }

  /**
   * Display table
   */
  showTable(headers, rows) {
    // Calculate column widths
    const widths = headers.map((h, i) => {
      const headerWidth = h.length;
      const maxRowWidth = Math.max(...rows.map(r => String(r[i] || '').length));
      return Math.max(headerWidth, maxRowWidth) + 2;
    });
    
    // Print headers
    const headerRow = headers.map((h, i) => h.padEnd(widths[i])).join('│');
    console.log(this.theme.info(headerRow));
    console.log(this.theme.muted('─'.repeat(headerRow.length)));
    
    // Print rows
    rows.forEach(row => {
      const rowStr = row.map((cell, i) => String(cell || '').padEnd(widths[i])).join('│');
      console.log(rowStr);
    });
    
    console.log();
  }

  /**
   * Format message with emoji
   */
  formatMessage(message, emoji) {
    if (this.options.emoji && emoji && this.emoji[emoji]) {
      return `${this.emoji[emoji]}  ${message}`;
    }
    return message;
  }

  /**
   * Get emoji (returns empty string if disabled)
   */
  getEmoji(name) {
    if (!this.options.emoji) return '';
    return this.emoji[name] || '';
  }

  /**
   * Wait for keypress
   */
  async waitForKey(message = 'Press any key to continue...') {
    console.log(this.theme.muted(message));
    
    return new Promise((resolve) => {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once('data', () => {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve();
      });
    });
  }

  /**
   * Display box with content
   */
  showBox(content, options = {}) {
    const lines = content.split('\n');
    const maxLength = Math.max(...lines.map(l => l.length));
    const width = maxLength + 4;
    
    const color = options.color || this.theme.primary;
    
    // Top border
    console.log(color('┌' + '─'.repeat(width - 2) + '┐'));
    
    // Content
    lines.forEach(line => {
      const padded = line.padEnd(maxLength);
      console.log(color('│ ') + padded + color(' │'));
    });
    
    // Bottom border
    console.log(color('└' + '─'.repeat(width - 2) + '┘'));
    console.log();
  }
}

module.exports = CLIInterface;