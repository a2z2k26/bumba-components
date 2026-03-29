const https = require('https');
const { EventEmitter } = require('events');

class OpenAIProvider extends EventEmitter {
  constructor(config = {}) {
    super();
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.organization = config.organization || process.env.OPENAI_ORG_ID;
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries || 3;
    this.models = new Map();
    
    // Rate limiting
    this.rateLimits = {
      requestsPerMinute: config.requestsPerMinute || 60,
      tokensPerMinute: config.tokensPerMinute || 90000,
      requestsPerDay: config.requestsPerDay || 10000
    };
    
    this.usage = {
      requests: [],
      tokens: [],
      daily: { requests: 0, tokens: 0, cost: 0 }
    };
    
    this.initializeModels();
  }

  initializeModels() {
    // GPT-4 Models
    this.models.set('gpt-4', {
      id: 'gpt-4',
      contextLength: 8192,
      pricing: { prompt: 0.03, completion: 0.06 }, // per 1K tokens
      capabilities: ['chat', 'completion', 'function_calling'],
      tier: 'premium'
    });
    
    this.models.set('gpt-4-turbo-preview', {
      id: 'gpt-4-turbo-preview',
      contextLength: 128000,
      pricing: { prompt: 0.01, completion: 0.03 },
      capabilities: ['chat', 'completion', 'function_calling', 'vision'],
      tier: 'premium'
    });
    
    this.models.set('gpt-4-1106-preview', {
      id: 'gpt-4-1106-preview',
      contextLength: 128000,
      pricing: { prompt: 0.01, completion: 0.03 },
      capabilities: ['chat', 'completion', 'function_calling', 'json_mode'],
      tier: 'premium'
    });
    
    // GPT-3.5 Models
    this.models.set('gpt-3.5-turbo', {
      id: 'gpt-3.5-turbo',
      contextLength: 16384,
      pricing: { prompt: 0.0005, completion: 0.0015 },
      capabilities: ['chat', 'completion', 'function_calling'],
      tier: 'standard'
    });
    
    this.models.set('gpt-3.5-turbo-1106', {
      id: 'gpt-3.5-turbo-1106',
      contextLength: 16384,
      pricing: { prompt: 0.001, completion: 0.002 },
      capabilities: ['chat', 'completion', 'function_calling', 'json_mode'],
      tier: 'standard'
    });
    
    // Embedding Models
    this.models.set('text-embedding-3-small', {
      id: 'text-embedding-3-small',
      dimensions: 1536,
      pricing: { usage: 0.00002 }, // per 1K tokens
      capabilities: ['embeddings'],
      tier: 'embedding'
    });
    
    this.models.set('text-embedding-3-large', {
      id: 'text-embedding-3-large',
      dimensions: 3072,
      pricing: { usage: 0.00013 },
      capabilities: ['embeddings'],
      tier: 'embedding'
    });
  }

  async chat(messages, options = {}) {
    const model = options.model || 'gpt-3.5-turbo';
    const modelConfig = this.models.get(model);
    
    if (!modelConfig) {
      throw new Error(`Model ${model} not supported`);
    }
    
    // Check rate limits
    if (!this.checkRateLimits()) {
      throw new Error('Rate limit exceeded. Please wait before making another request.');
    }
    
    const requestBody = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      top_p: options.topP ?? 1,
      frequency_penalty: options.frequencyPenalty ?? 0,
      presence_penalty: options.presencePenalty ?? 0,
      stream: options.stream ?? false,
      n: options.n ?? 1
    };
    
    // Add optional parameters
    if (options.functions) {
      requestBody.functions = options.functions;
      requestBody.function_call = options.functionCall || 'auto';
    }
    
    if (options.responseFormat) {
      requestBody.response_format = options.responseFormat;
    }
    
    if (options.stop) {
      requestBody.stop = options.stop;
    }
    
    if (options.user) {
      requestBody.user = options.user;
    }
    
    try {
      const response = await this.makeRequest('/chat/completions', requestBody);
      
      // Track usage
      this.trackUsage(response.usage, modelConfig.pricing);
      
      // Emit completion event
      this.emit('completion', {
        model,
        usage: response.usage,
        response: response.choices[0],
        requestId: response.id
      });
      
      return {
        content: response.choices[0].message.content,
        role: response.choices[0].message.role,
        functionCall: response.choices[0].message.function_call,
        usage: response.usage,
        model: response.model,
        id: response.id,
        finishReason: response.choices[0].finish_reason
      };
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async streamChat(messages, options = {}, onChunk) {
    const model = options.model || 'gpt-3.5-turbo';
    options.stream = true;
    
    const requestBody = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      stream: true
    };
    
    return new Promise((resolve, reject) => {
      const chunks = [];
      let fullContent = '';
      
      this.makeStreamRequest('/chat/completions', requestBody, (chunk) => {
        // Parse SSE data
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              resolve({
                content: fullContent,
                chunks,
                model
              });
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices[0].delta;
              
              if (delta.content) {
                fullContent += delta.content;
                chunks.push(delta.content);
                
                if (onChunk) {
                  onChunk(delta.content, parsed);
                }
              }
            } catch (error) {
              console.error('Error parsing stream chunk:', error);
            }
          }
        }
      }).catch(reject);
    });
  }

  async embeddings(input, options = {}) {
    const model = options.model || 'text-embedding-3-small';
    const modelConfig = this.models.get(model);
    
    if (!modelConfig || !modelConfig.capabilities.includes('embeddings')) {
      throw new Error(`Model ${model} does not support embeddings`);
    }
    
    const requestBody = {
      model,
      input: Array.isArray(input) ? input : [input],
      encoding_format: options.encodingFormat || 'float',
      dimensions: options.dimensions || modelConfig.dimensions
    };
    
    try {
      const response = await this.makeRequest('/embeddings', requestBody);
      
      // Track usage
      this.trackUsage(response.usage, modelConfig.pricing);
      
      return {
        embeddings: response.data.map(d => d.embedding),
        model: response.model,
        usage: response.usage
      };
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async moderation(input) {
    const requestBody = {
      input: Array.isArray(input) ? input : [input]
    };
    
    try {
      const response = await this.makeRequest('/moderations', requestBody);
      
      return {
        results: response.results,
        id: response.id,
        model: response.model
      };
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async makeRequest(endpoint, body, retries = 0) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }
    
    const options = {
      hostname: 'api.openai.com',
      path: '/v1' + endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'User-Agent': 'BUMBA-CLI/1.0'
      },
      timeout: this.timeout
    };
    
    if (this.organization) {
      options.headers['OpenAI-Organization'] = this.organization;
    }
    
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (error) {
              reject(new Error('Invalid JSON response'));
            }
          } else {
            const error = this.parseError(res.statusCode, data);
            
            // Retry on rate limit or server errors
            if ((res.statusCode === 429 || res.statusCode >= 500) && retries < this.maxRetries) {
              const delay = this.getRetryDelay(retries, res.headers);
              setTimeout(() => {
                this.makeRequest(endpoint, body, retries + 1)
                  .then(resolve)
                  .catch(reject);
              }, delay);
            } else {
              reject(error);
            }
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.write(JSON.stringify(body));
      req.end();
    });
  }

  async makeStreamRequest(endpoint, body, onChunk) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }
    
    const options = {
      hostname: 'api.openai.com',
      path: '/v1' + endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'User-Agent': 'BUMBA-CLI/1.0'
      }
    };
    
    if (this.organization) {
      options.headers['OpenAI-Organization'] = this.organization;
    }
    
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          let errorData = '';
          res.on('data', chunk => errorData += chunk);
          res.on('end', () => {
            reject(this.parseError(res.statusCode, errorData));
          });
          return;
        }
        
        res.on('data', (chunk) => {
          onChunk(chunk.toString());
        });
        
        res.on('end', resolve);
      });
      
      req.on('error', reject);
      req.write(JSON.stringify(body));
      req.end();
    });
  }

  checkRateLimits() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneDayAgo = now - 86400000;
    
    // Clean old entries
    this.usage.requests = this.usage.requests.filter(t => t > oneMinuteAgo);
    this.usage.tokens = this.usage.tokens.filter(t => t.time > oneMinuteAgo);
    
    // Check per-minute limits
    if (this.usage.requests.length >= this.rateLimits.requestsPerMinute) {
      return false;
    }
    
    const recentTokens = this.usage.tokens.reduce((sum, t) => sum + t.count, 0);
    if (recentTokens >= this.rateLimits.tokensPerMinute) {
      return false;
    }
    
    // Check daily limits
    if (this.usage.daily.requests >= this.rateLimits.requestsPerDay) {
      // Reset if new day
      const lastReset = this.usage.daily.lastReset || 0;
      if (now - lastReset > 86400000) {
        this.usage.daily = { requests: 0, tokens: 0, cost: 0, lastReset: now };
      } else {
        return false;
      }
    }
    
    return true;
  }

  trackUsage(usage, pricing) {
    if (!usage) return;
    
    const now = Date.now();
    
    // Track request
    this.usage.requests.push(now);
    this.usage.daily.requests++;
    
    // Track tokens
    if (usage.prompt_tokens) {
      this.usage.tokens.push({ time: now, count: usage.prompt_tokens });
      this.usage.daily.tokens += usage.prompt_tokens;
    }
    
    if (usage.completion_tokens) {
      this.usage.tokens.push({ time: now, count: usage.completion_tokens });
      this.usage.daily.tokens += usage.completion_tokens;
    }
    
    // Calculate cost
    if (pricing) {
      let cost = 0;
      
      if (pricing.prompt && usage.prompt_tokens) {
        cost += (usage.prompt_tokens / 1000) * pricing.prompt;
      }
      
      if (pricing.completion && usage.completion_tokens) {
        cost += (usage.completion_tokens / 1000) * pricing.completion;
      }
      
      if (pricing.usage && usage.total_tokens) {
        cost = (usage.total_tokens / 1000) * pricing.usage;
      }
      
      this.usage.daily.cost += cost;
      
      // Emit usage event
      this.emit('usage', {
        tokens: usage,
        cost,
        daily: this.usage.daily
      });
    }
  }

  parseError(statusCode, data) {
    let message = `OpenAI API error: ${statusCode}`;
    let errorData = {};
    
    try {
      errorData = JSON.parse(data);
      if (errorData.error) {
        message = errorData.error.message || errorData.error.type || message;
      }
    } catch (e) {
      message += ` - ${data}`;
    }
    
    const error = new Error(message);
    error.statusCode = statusCode;
    error.data = errorData;
    
    // Add specific error types
    switch (statusCode) {
      case 400:
        error.type = 'BadRequestError';
        break;
      case 401:
        error.type = 'AuthenticationError';
        break;
      case 403:
        error.type = 'PermissionError';
        break;
      case 404:
        error.type = 'NotFoundError';
        break;
      case 429:
        error.type = 'RateLimitError';
        error.retryAfter = errorData.error?.retry_after;
        break;
      case 500:
      case 502:
      case 503:
        error.type = 'ServerError';
        break;
      default:
        error.type = 'UnknownError';
    }
    
    return error;
  }

  getRetryDelay(retries, headers) {
    // Check for Retry-After header
    if (headers && headers['retry-after']) {
      const retryAfter = parseInt(headers['retry-after']);
      if (!isNaN(retryAfter)) {
        return retryAfter * 1000;
      }
    }
    
    // Exponential backoff with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, retries), 60000);
    const jitter = Math.random() * baseDelay * 0.1;
    return baseDelay + jitter;
  }

  handleError(error) {
    this.emit('error', {
      provider: 'openai',
      error,
      timestamp: Date.now()
    });
    
    // Log specific error types
    if (error.type === 'RateLimitError') {
      console.error('OpenAI rate limit exceeded. Consider upgrading your plan or reducing request frequency.');
    } else if (error.type === 'AuthenticationError') {
      console.error('OpenAI authentication failed. Check your API key.');
    }
  }

  async testConnection() {
    try {
      const response = await this.chat(
        [{ role: 'user', content: 'Hello' }],
        { model: 'gpt-3.5-turbo', maxTokens: 5 }
      );
      return { success: true, response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getModelInfo(modelId) {
    return this.models.get(modelId);
  }

  listModels() {
    return Array.from(this.models.entries()).map(([id, config]) => ({
      id,
      ...config
    }));
  }

  getUsageStats() {
    return {
      current: {
        requestsPerMinute: this.usage.requests.length,
        tokensPerMinute: this.usage.tokens.reduce((sum, t) => sum + t.count, 0)
      },
      daily: this.usage.daily,
      limits: this.rateLimits
    };
  }
}

module.exports = { OpenAIProvider };