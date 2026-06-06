/**
 * Retry Handler with Exponential Backoff
 * Sprint 1.2: Intelligent retry logic for API calls
 */

class RetryHandler {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelay = options.baseDelay ?? 1000; // 1 second
    this.maxDelay = options.maxDelay ?? 30000; // 30 seconds
    this.retryableErrors = options.retryableErrors || [
      'network',
      'rate_limit',
      'server',
      'timeout'
    ];
  }

  /**
   * Execute function with exponential backoff retry
   */
  async executeWithRetry(fn, context = {}) {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await fn();
        return result;
      } catch (error) {
        lastError = error;

        // Check if error is retryable
        if (!this.isRetryable(error)) {
          throw error;
        }

        // Last attempt failed
        if (attempt === this.maxRetries) {
          throw new Error(
            `Failed after ${this.maxRetries} retries: ${error.message}`
          );
        }

        // Calculate delay
        const delay = this.calculateDelay(attempt, error);

        console.log(
          `  Attempt ${attempt + 1} failed: ${error.message}. Retrying in ${delay}ms...`
        );

        // Wait before retry
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Check if error is retryable
   */
  isRetryable(error) {
    // Check error type if available
    if (error.type) {
      return this.retryableErrors.includes(error.type);
    }

    // Check status code
    if (error.statusCode) {
      // Retryable status codes
      const retryableStatusCodes = [429, 500, 502, 503, 504];
      return retryableStatusCodes.includes(error.statusCode);
    }

    // Check error message for network errors
    const networkErrors = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'];
    return networkErrors.some(code => error.message?.includes(code));
  }

  /**
   * Calculate delay with exponential backoff
   */
  calculateDelay(attempt, error) {
    // Use longer delay for rate limits
    if (error.type === 'rate_limit' || error.statusCode === 429) {
      return Math.min(
        Math.pow(2, attempt + 2) * this.baseDelay,
        this.maxDelay
      );
    }

    // Standard exponential backoff: 2^attempt * baseDelay
    return Math.min(
      Math.pow(2, attempt) * this.baseDelay,
      this.maxDelay
    );
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = RetryHandler;
