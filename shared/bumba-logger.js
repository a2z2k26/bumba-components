/**
 * BUMBA Logger - Standalone stub
 * Minimal logging interface for BUMBA ecosystem
 *
 * Replace this with your own logger (winston, pino, etc.) if needed
 */

const chalk = require('chalk');

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };

class BumbaLogger {
  constructor(options = {}) {
    this.level = options.level || process.env.LOG_LEVEL || 'info';
    this.prefix = options.prefix || '';
    this.silent = options.silent || false;
  }

  _shouldLog(level) {
    if (this.silent) return false;
    return LOG_LEVELS[level] <= LOG_LEVELS[this.level];
  }

  _format(level, message) {
    const ts = new Date().toISOString().substr(11, 12);
    const pre = this.prefix ? `[${this.prefix}]` : '';
    return `${ts} ${level.toUpperCase().padEnd(5)} ${pre} ${message}`;
  }

  error(message, ...args) {
    if (this._shouldLog('error')) console.error(chalk.red(this._format('error', message)), ...args);
  }

  warn(message, ...args) {
    if (this._shouldLog('warn')) console.warn(chalk.yellow(this._format('warn', message)), ...args);
  }

  info(message, ...args) {
    if (this._shouldLog('info')) console.log(chalk.blue(this._format('info', message)), ...args);
  }

  debug(message, ...args) {
    if (this._shouldLog('debug')) console.log(chalk.gray(this._format('debug', message)), ...args);
  }

  trace(message, ...args) {
    if (this._shouldLog('trace')) console.log(chalk.dim(this._format('trace', message)), ...args);
  }

  child(prefix) {
    return new BumbaLogger({ ...this, prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix });
  }
}

const logger = new BumbaLogger();

module.exports = { logger, BumbaLogger, createLogger: (opts) => new BumbaLogger(opts) };
