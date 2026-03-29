/**
 * Common Types and Interfaces
 * JSDoc type definitions for use across all modules
 */

/**
 * @typedef {Object} TokenUsage
 * @property {number} inputTokens - Number of input tokens
 * @property {number} outputTokens - Number of output tokens
 * @property {number} totalTokens - Total tokens used
 * @property {number} [cachedTokens] - Tokens served from cache
 */

/**
 * @typedef {Object} ModelInfo
 * @property {string} id - Model identifier
 * @property {string} provider - Provider name (anthropic, openai, google)
 * @property {number} contextWindow - Maximum context window size
 * @property {number} inputCostPer1k - Cost per 1K input tokens
 * @property {number} outputCostPer1k - Cost per 1K output tokens
 * @property {string[]} capabilities - Model capabilities
 */

/**
 * @typedef {Object} TaskSpec
 * @property {string} id - Unique task identifier
 * @property {string} type - Task type
 * @property {string} description - Human-readable description
 * @property {'low'|'normal'|'high'|'critical'} priority - Task priority
 * @property {string[]} [dependencies] - IDs of tasks this depends on
 * @property {Object} [metadata] - Additional task metadata
 */

/**
 * @typedef {Object} AgentSpec
 * @property {string} id - Unique agent identifier
 * @property {string} name - Agent display name
 * @property {string[]} capabilities - List of capabilities
 * @property {'idle'|'busy'|'error'|'offline'} status - Current status
 * @property {Object} [config] - Agent configuration
 */

/**
 * @typedef {Object} HealthStatus
 * @property {'healthy'|'degraded'|'unhealthy'|'unknown'} status
 * @property {number} latency - Response latency in ms
 * @property {number} errorRate - Error rate (0-1)
 * @property {Date} lastCheck - Last health check timestamp
 * @property {Object} [details] - Additional health details
 */

/**
 * @typedef {Object} RateLimitInfo
 * @property {number} remaining - Remaining requests
 * @property {number} limit - Total limit
 * @property {number} resetAt - Reset timestamp (Unix ms)
 * @property {string} [bucket] - Rate limit bucket name
 */

/**
 * @typedef {Object} CostRecord
 * @property {string} provider - Provider name
 * @property {string} model - Model used
 * @property {TokenUsage} usage - Token usage
 * @property {number} cost - Total cost in USD
 * @property {Date} timestamp - When the cost was incurred
 */

/**
 * @typedef {Object} MemoryEntry
 * @property {string} id - Unique entry identifier
 * @property {string} type - Entry type (knowledge, context, session)
 * @property {*} content - Entry content
 * @property {string[]} tags - Associated tags
 * @property {number} importance - Importance score (0-1)
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} accessedAt - Last access timestamp
 * @property {number} accessCount - Number of times accessed
 */

/**
 * @typedef {Object} TraceSpan
 * @property {string} id - Span identifier
 * @property {string} traceId - Parent trace identifier
 * @property {string} name - Span name
 * @property {number} startTime - Start timestamp (Unix ms)
 * @property {number} [endTime] - End timestamp (Unix ms)
 * @property {'active'|'completed'|'error'} status - Span status
 * @property {Object} [attributes] - Span attributes
 */

/**
 * @typedef {Object} PipelineStage
 * @property {string} name - Stage name
 * @property {Function} handler - Stage handler function
 * @property {string[]} [dependsOn] - Dependencies
 * @property {number} [timeout] - Stage timeout in ms
 * @property {number} [retries] - Number of retries
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string[]} errors - Validation errors
 * @property {string[]} warnings - Validation warnings
 */

// Export empty object - types are for JSDoc only
module.exports = {};
