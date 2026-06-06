/**
 * OpenAI API Connector for BUMBA
 * Handles all interactions with OpenAI's API including GPT-4, DALL-E, and Embeddings
 */

const EventEmitter = require('events');

class OpenAIConnector extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      apiKey: options.apiKey || process.env.OPENAI_API_KEY,
      organization: options.organization || process.env.OPENAI_ORG_ID,
      baseURL: options.baseURL || 'https://api.openai.com/v1',
      timeout: options.timeout || 30000,
      maxRetries: options.maxRetries || 3,
      ...options
    };

    // Validate API key
    if (!this.options.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    // Rate limiting
    this.rateLimits = {
      requests: { limit: 3500, window: 60000, current: 0 },
      tokens: { limit: 90000, window: 60000, current: 0 }
    };

    // Usage tracking
    this.usage = {
      totalTokens: 0,
      totalCost: 0,
      requests: 0
    };

    // Model configurations
    this.models = {
      'gpt-4-turbo-preview': { maxTokens: 128000, costPer1k: { input: 0.01, output: 0.03 } },
      'gpt-4': { maxTokens: 8192, costPer1k: { input: 0.03, output: 0.06 } },
      'gpt-3.5-turbo': { maxTokens: 16385, costPer1k: { input: 0.0005, output: 0.0015 } },
      'gpt-3.5-turbo-16k': { maxTokens: 16385, costPer1k: { input: 0.003, output: 0.004 } }
    };
  }

  /**
   * Make authenticated request to OpenAI API
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.options.baseURL}${endpoint}`;

    const headers = {
      'Authorization': `Bearer ${this.options.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.options.organization) {
      headers['OpenAI-Organization'] = this.options.organization;
    }

    // Check rate limits
    await this.checkRateLimits();

    let lastError;
    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: options.method || 'POST',
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(this.options.timeout)
        });

        // Update rate limit info from headers
        this.updateRateLimits(response.headers);

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));

          if (response.status === 429) {
            // Rate limited - wait and retry
            const retryAfter = parseInt(response.headers.get('retry-after') || '5');
            await this.delay(retryAfter * 1000);
            continue;
          }

          throw new Error(error.error?.message || `API error: ${response.status}`);
        }

        const data = await response.json();

        // Track usage
        if (data.usage) {
          this.trackUsage(data.usage, options.body?.model);
        }

        return data;

      } catch (error) {
        lastError = error;

        if (attempt < this.options.maxRetries - 1) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError;
  }

  /**
   * Chat completion
   */
  async chatCompletion(messages, options = {}) {
    const body = {
      model: options.model || 'gpt-3.5-turbo',
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      top_p: options.topP ?? 1,
      frequency_penalty: options.frequencyPenalty ?? 0,
      presence_penalty: options.presencePenalty ?? 0,
      stop: options.stop,
      stream: options.stream || false,
      user: options.user,
      ...options
    };

    if (options.functions) {
      body.functions = options.functions;
      body.function_call = options.functionCall;
    }

    if (options.tools) {
      body.tools = options.tools;
      body.tool_choice = options.toolChoice;
    }

    if (body.stream) {
      return this.streamChatCompletion(body);
    }

    const response = await this.makeRequest('/chat/completions', {
      method: 'POST',
      body
    });

    this.emit('completion', {
      model: body.model,
      messages: messages.length,
      response: response.choices[0].message
    });

    return response;
  }

  /**
   * Stream chat completion
   */
  async streamChatCompletion(body) {
    const url = `${this.options.baseURL}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.options.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Stream request failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    return {
      async *[Symbol.asyncIterator]() {
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);

              if (data === '[DONE]') {
                return;
              }

              try {
                const parsed = JSON.parse(data);
                yield parsed;
              } catch {
                // Invalid JSON, skip
              }
            }
          }
        }
      }
    };
  }

  /**
   * Text completion (for older models)
   */
  async completion(prompt, options = {}) {
    const body = {
      model: options.model || 'gpt-3.5-turbo-instruct',
      prompt,
      max_tokens: options.maxTokens || 150,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 1,
      frequency_penalty: options.frequencyPenalty ?? 0,
      presence_penalty: options.presencePenalty ?? 0,
      stop: options.stop,
      ...options
    };

    const response = await this.makeRequest('/completions', {
      method: 'POST',
      body
    });

    return response;
  }

  /**
   * Create embeddings
   */
  async createEmbedding(input, options = {}) {
    const body = {
      model: options.model || 'text-embedding-ada-002',
      input: Array.isArray(input) ? input : [input],
      encoding_format: options.encodingFormat || 'float',
      ...options
    };

    const response = await this.makeRequest('/embeddings', {
      method: 'POST',
      body
    });

    this.emit('embedding', {
      model: body.model,
      inputCount: body.input.length
    });

    return response;
  }

  /**
   * Image generation with DALL-E
   */
  async createImage(prompt, options = {}) {
    const body = {
      model: options.model || 'dall-e-3',
      prompt,
      n: options.n || 1,
      size: options.size || '1024x1024',
      quality: options.quality || 'standard',
      style: options.style || 'natural',
      response_format: options.responseFormat || 'url',
      ...options
    };

    const response = await this.makeRequest('/images/generations', {
      method: 'POST',
      body
    });

    this.emit('image', {
      model: body.model,
      prompt: prompt.substring(0, 50) + '...',
      size: body.size
    });

    return response;
  }

  /**
   * Image edit with DALL-E
   */
  async editImage(image, prompt, options = {}) {
    const formData = new FormData();
    formData.append('image', image);
    formData.append('prompt', prompt);

    if (options.mask) {
      formData.append('mask', options.mask);
    }

    formData.append('model', options.model || 'dall-e-2');
    formData.append('n', String(options.n || 1));
    formData.append('size', options.size || '1024x1024');
    formData.append('response_format', options.responseFormat || 'url');

    const response = await fetch(`${this.options.baseURL}/images/edits`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.options.apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Image edit failed');
    }

    return response.json();
  }

  /**
   * Image variation with DALL-E
   */
  async createImageVariation(image, options = {}) {
    const formData = new FormData();
    formData.append('image', image);
    formData.append('model', options.model || 'dall-e-2');
    formData.append('n', String(options.n || 1));
    formData.append('size', options.size || '1024x1024');
    formData.append('response_format', options.responseFormat || 'url');

    const response = await fetch(`${this.options.baseURL}/images/variations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.options.apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Image variation failed');
    }

    return response.json();
  }

  /**
   * Audio transcription with Whisper
   */
  async transcribeAudio(audio, options = {}) {
    const formData = new FormData();
    formData.append('file', audio);
    formData.append('model', options.model || 'whisper-1');

    if (options.prompt) formData.append('prompt', options.prompt);
    if (options.responseFormat) formData.append('response_format', options.responseFormat);
    if (options.temperature) formData.append('temperature', String(options.temperature));
    if (options.language) formData.append('language', options.language);

    const response = await fetch(`${this.options.baseURL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.options.apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Transcription failed');
    }

    return response.json();
  }

  /**
   * Audio translation with Whisper
   */
  async translateAudio(audio, options = {}) {
    const formData = new FormData();
    formData.append('file', audio);
    formData.append('model', options.model || 'whisper-1');

    if (options.prompt) formData.append('prompt', options.prompt);
    if (options.responseFormat) formData.append('response_format', options.responseFormat);
    if (options.temperature) formData.append('temperature', String(options.temperature));

    const response = await fetch(`${this.options.baseURL}/audio/translations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.options.apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Translation failed');
    }

    return response.json();
  }

  /**
   * Text-to-speech with TTS
   */
  async createSpeech(text, options = {}) {
    const body = {
      model: options.model || 'tts-1',
      input: text,
      voice: options.voice || 'alloy',
      response_format: options.responseFormat || 'mp3',
      speed: options.speed || 1.0
    };

    const response = await fetch(`${this.options.baseURL}/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.options.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Speech generation failed');
    }

    return response.blob();
  }

  /**
   * Moderation
   */
  async createModeration(input, options = {}) {
    const body = {
      input: Array.isArray(input) ? input : [input],
      model: options.model || 'text-moderation-latest'
    };

    const response = await this.makeRequest('/moderations', {
      method: 'POST',
      body
    });

    return response;
  }

  /**
   * List available models
   */
  async listModels() {
    const response = await this.makeRequest('/models', {
      method: 'GET'
    });

    return response;
  }

  /**
   * Get model details
   */
  async getModel(modelId) {
    const response = await this.makeRequest(`/models/${modelId}`, {
      method: 'GET'
    });

    return response;
  }

  /**
   * Fine-tuning: Create fine-tuning job
   */
  async createFineTuningJob(trainingFile, options = {}) {
    const body = {
      training_file: trainingFile,
      model: options.model || 'gpt-3.5-turbo',
      hyperparameters: options.hyperparameters,
      suffix: options.suffix,
      validation_file: options.validationFile
    };

    const response = await this.makeRequest('/fine_tuning/jobs', {
      method: 'POST',
      body
    });

    return response;
  }

  /**
   * Fine-tuning: List jobs
   */
  async listFineTuningJobs(options = {}) {
    const params = new URLSearchParams();
    if (options.after) params.append('after', options.after);
    if (options.limit) params.append('limit', String(options.limit));

    const response = await this.makeRequest(`/fine_tuning/jobs?${params}`, {
      method: 'GET'
    });

    return response;
  }

  /**
   * Fine-tuning: Get job details
   */
  async getFineTuningJob(jobId) {
    const response = await this.makeRequest(`/fine_tuning/jobs/${jobId}`, {
      method: 'GET'
    });

    return response;
  }

  /**
   * Fine-tuning: Cancel job
   */
  async cancelFineTuningJob(jobId) {
    const response = await this.makeRequest(`/fine_tuning/jobs/${jobId}/cancel`, {
      method: 'POST'
    });

    return response;
  }

  /**
   * Files: Upload file
   */
  async uploadFile(file, purpose = 'fine-tune') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', purpose);

    const response = await fetch(`${this.options.baseURL}/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.options.apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'File upload failed');
    }

    return response.json();
  }

  /**
   * Files: List files
   */
  async listFiles(purpose) {
    const params = purpose ? `?purpose=${purpose}` : '';

    const response = await this.makeRequest(`/files${params}`, {
      method: 'GET'
    });

    return response;
  }

  /**
   * Files: Delete file
   */
  async deleteFile(fileId) {
    const response = await this.makeRequest(`/files/${fileId}`, {
      method: 'DELETE'
    });

    return response;
  }

  /**
   * Assistants API: Create assistant
   */
  async createAssistant(options = {}) {
    const body = {
      model: options.model || 'gpt-4-turbo-preview',
      name: options.name,
      description: options.description,
      instructions: options.instructions,
      tools: options.tools || [],
      file_ids: options.fileIds || [],
      metadata: options.metadata
    };

    const response = await this.makeRequest('/assistants', {
      method: 'POST',
      body
    });

    return response;
  }

  /**
   * Assistants API: List assistants
   */
  async listAssistants(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', String(options.limit));
    if (options.order) params.append('order', options.order);
    if (options.after) params.append('after', options.after);
    if (options.before) params.append('before', options.before);

    const response = await this.makeRequest(`/assistants?${params}`, {
      method: 'GET'
    });

    return response;
  }

  /**
   * Assistants API: Create thread
   */
  async createThread(options = {}) {
    const body = {
      messages: options.messages,
      metadata: options.metadata
    };

    const response = await this.makeRequest('/threads', {
      method: 'POST',
      body
    });

    return response;
  }

  /**
   * Assistants API: Create message
   */
  async createMessage(threadId, content, options = {}) {
    const body = {
      role: options.role || 'user',
      content,
      file_ids: options.fileIds,
      metadata: options.metadata
    };

    const response = await this.makeRequest(`/threads/${threadId}/messages`, {
      method: 'POST',
      body
    });

    return response;
  }

  /**
   * Assistants API: Run assistant
   */
  async runAssistant(threadId, assistantId, options = {}) {
    const body = {
      assistant_id: assistantId,
      model: options.model,
      instructions: options.instructions,
      tools: options.tools,
      metadata: options.metadata
    };

    const response = await this.makeRequest(`/threads/${threadId}/runs`, {
      method: 'POST',
      body
    });

    return response;
  }

  /**
   * Check rate limits
   */
  async checkRateLimits() {
    const now = Date.now();

    // Reset counters if window has passed
    if (now - this.rateLimits.requests.lastReset > this.rateLimits.requests.window) {
      this.rateLimits.requests.current = 0;
      this.rateLimits.requests.lastReset = now;
    }

    if (now - this.rateLimits.tokens.lastReset > this.rateLimits.tokens.window) {
      this.rateLimits.tokens.current = 0;
      this.rateLimits.tokens.lastReset = now;
    }

    // Check if at limit
    if (this.rateLimits.requests.current >= this.rateLimits.requests.limit) {
      const waitTime = this.rateLimits.requests.window - (now - this.rateLimits.requests.lastReset);
      await this.delay(waitTime);
    }

    this.rateLimits.requests.current++;
  }

  /**
   * Update rate limits from response headers
   */
  updateRateLimits(headers) {
    const requestsLimit = headers.get('x-ratelimit-limit-requests');
    const requestsRemaining = headers.get('x-ratelimit-remaining-requests');
    const tokensLimit = headers.get('x-ratelimit-limit-tokens');
    const tokensRemaining = headers.get('x-ratelimit-remaining-tokens');

    if (requestsLimit) {
      this.rateLimits.requests.limit = parseInt(requestsLimit);
    }

    if (requestsRemaining) {
      this.rateLimits.requests.current = this.rateLimits.requests.limit - parseInt(requestsRemaining);
    }

    if (tokensLimit) {
      this.rateLimits.tokens.limit = parseInt(tokensLimit);
    }

    if (tokensRemaining) {
      this.rateLimits.tokens.current = this.rateLimits.tokens.limit - parseInt(tokensRemaining);
    }
  }

  /**
   * Track usage and costs
   */
  trackUsage(usage, model) {
    this.usage.totalTokens += usage.total_tokens || 0;
    this.usage.requests++;

    if (model && this.models[model]) {
      const costs = this.models[model].costPer1k;
      const inputCost = (usage.prompt_tokens || 0) * costs.input / 1000;
      const outputCost = (usage.completion_tokens || 0) * costs.output / 1000;
      this.usage.totalCost += inputCost + outputCost;
    }

    this.emit('usage', {
      tokens: usage.total_tokens,
      cost: this.usage.totalCost,
      requests: this.usage.requests
    });
  }

  /**
   * Get usage statistics
   */
  getUsage() {
    return {
      ...this.usage,
      rateLimits: this.rateLimits
    };
  }

  /**
   * Reset usage statistics
   */
  resetUsage() {
    this.usage = {
      totalTokens: 0,
      totalCost: 0,
      requests: 0
    };
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate API key
   */
  async validateApiKey() {
    try {
      const models = await this.listModels();
      return {
        valid: true,
        models: models.data.map(m => m.id)
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

module.exports = OpenAIConnector;