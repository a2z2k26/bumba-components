/**
 * Logger Stub - Minimal logging interface for standalone primitives
 * Can be replaced with any logging library (winston, pino, etc.)
 */

const chalk = require('chalk');

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

class LoggerStub {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.prefix = options.prefix || '';
    this.silent = options.silent || false;
  }

  _shouldLog(level) {
    if (this.silent) return false;
    return LOG_LEVELS[level] <= LOG_LEVELS[this.level];
  }

  _format(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const prefix = this.prefix ? `[${this.prefix}]` : '';
    return `${timestamp} ${level.toUpperCase()} ${prefix} ${message}`;
  }

  error(message, ...args) {
    if (this._shouldLog('error')) {
      console.error(chalk.red(this._format('error', message)), ...args);
    }
  }

  warn(message, ...args) {
    if (this._shouldLog('warn')) {
      console.warn(chalk.yellow(this._format('warn', message)), ...args);
    }
  }

  info(message, ...args) {
    if (this._shouldLog('info')) {
      console.log(chalk.blue(this._format('info', message)), ...args);
    }
  }

  debug(message, ...args) {
    if (this._shouldLog('debug')) {
      console.log(chalk.gray(this._format('debug', message)), ...args);
    }
  }

  trace(message, ...args) {
    if (this._shouldLog('trace')) {
      console.log(chalk.dim(this._format('trace', message)), ...args);
    }
  }
}

// Singleton instance for global logging
const defaultLogger = new LoggerStub();

module.exports = {
  LoggerStub,
  createLogger: (options) => new LoggerStub(options),
  logger: defaultLogger,
  error: (...args) => defaultLogger.error(...args),
  warn: (...args) => defaultLogger.warn(...args),
  info: (...args) => defaultLogger.info(...args),
  debug: (...args) => defaultLogger.debug(...args),
  trace: (...args) => defaultLogger.trace(...args)
};
