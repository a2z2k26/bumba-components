/**
 * Google AI Translator
 * Handles Google Gemini API interactions and protocol translation
 */

const axios = require('axios');

class GoogleTranslator {
  constructor(config = {}) {
    this.config = config;
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || 'https://generativelanguage.googleapis.com/v1beta';
    this.models = config.models || ['gemini-pro', 'gemini-pro-vision'];
    this.defaultModel = config.defaultModel || 'gemini-pro';
  }

  isEnabled() {
    return this.config.enabled && !!this.apiKey;
  }

  getModels() {
    return this.models;
  }

  async handle(request, model) {
    if (!this.isEnabled()) {
      throw new Error('Google AI API is not configured');
    }

    const modelName = model || this.defaultModel;

    try {
      const response = await axios.post(
        `${this.baseURL}/models/${modelName}:generateContent?key=${this.apiKey}`,
        request,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async chat(messages, options = {}) {
    const request = {
      contents: this.formatContents(messages),
      generationConfig: this.extractGenerationConfig(options)
    };

    if (options.safetySettings) {
      request.safetySettings = options.safetySettings;
    }

    const response = await this.handle(request, options.model);
    return this.formatResponse(response);
  }

  async stream(messages, options = {}) {
    const request = {
      contents: this.formatContents(messages),
      generationConfig: {
        ...this.extractGenerationConfig(options)
      }
    };

    const modelName = options.model || this.defaultModel;

    const response = await axios.post(
      `${this.baseURL}/models/${modelName}:streamGenerateContent?key=${this.apiKey}`,
      request,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      }
    );

    return this.parseStream(response.data);
  }

  formatContents(messages) {
    return messages.map((msg) => {
      if (typeof msg === 'string') {
        return {
          role: 'user',
          parts: [{ text: msg }]
        };
      }

      // Convert role names
      let role = msg.role;
      if (role === 'assistant' || role === 'system') {
        role = 'model';
      }

      // Format content parts
      let parts;
      if (Array.isArray(msg.content)) {
        parts = msg.content.map((part) => {
          if (typeof part === 'string') {
            return { text: part };
          }
          if (part.type === 'text') {
            return { text: part.text };
          }
          if (part.type === 'image') {
            return {
              inlineData: {
                mimeType: part.mimeType || 'image/jpeg',
                data: part.data
              }
            };
          }
          return part;
        });
      } else {
        parts = [{ text: msg.content }];
      }

      return { role, parts };
    });
  }

  extractGenerationConfig(options) {
    const config = {};

    if (options.temperature !== undefined) {
      config.temperature = options.temperature;
    }
    if (options.maxTokens !== undefined) {
      config.maxOutputTokens = options.maxTokens;
    }
    if (options.topP !== undefined) {
      config.topP = options.topP;
    }
    if (options.topK !== undefined) {
      config.topK = options.topK;
    }
    if (options.stopSequences !== undefined) {
      config.stopSequences = options.stopSequences;
    }

    return config;
  }

  formatResponse(response) {
    // Convert Google response to OpenAI-like format
    if (!response.candidates || response.candidates.length === 0) {
      throw new Error('No response from Google AI');
    }

    const candidate = response.candidates[0];
    const content = candidate.content?.parts?.map((p) => p.text).join('') || '';

    return {
      choices: [{
        message: {
          role: 'assistant',
          content
        },
        finish_reason: this.mapFinishReason(candidate.finishReason),
        index: 0
      }],
      usage: response.usageMetadata ? {
        prompt_tokens: response.usageMetadata.promptTokenCount,
        completion_tokens: response.usageMetadata.candidatesTokenCount,
        total_tokens: response.usageMetadata.totalTokenCount
      } : undefined
    };
  }

  async *parseStream(stream) {
    let buffer = '';

    for await (const chunk of stream) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            yield this.formatStreamChunk(parsed);
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
  }

  formatStreamChunk(chunk) {
    // Convert Google stream format to OpenAI-like format
    if (chunk.candidates && chunk.candidates[0]) {
      const candidate = chunk.candidates[0];
      const content = candidate.content?.parts?.map((p) => p.text).join('') || '';

      return {
        choices: [{
          delta: {
            content
          },
          index: 0,
          finish_reason: candidate.finishReason ? this.mapFinishReason(candidate.finishReason) : null
        }]
      };
    }
    return chunk;
  }

  mapFinishReason(reason) {
    const reasonMap = {
      'STOP': 'stop',
      'MAX_TOKENS': 'length',
      'SAFETY': 'content_filter',
      'RECITATION': 'content_filter',
      'OTHER': 'stop'
    };

    return reasonMap[reason] || 'stop';
  }

  handleError(error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (status === 400) {
        throw new Error(`Google AI API error: ${data.error?.message || 'Bad request'}`);
      } else if (status === 401 || status === 403) {
        throw new Error('Invalid Google AI API key');
      } else if (status === 429) {
        throw new Error('Google AI rate limit exceeded');
      } else {
        throw new Error(`Google AI API error: ${data.error?.message || error.message}`);
      }
    } else {
      throw new Error(`Network error: ${error.message}`);
    }
  }

  // Translate from OpenAI format to Google format
  translateFromOpenAI(request) {
    const translated = {
      contents: this.translateOpenAIMessages(request.messages),
      generationConfig: {}
    };

    if (request.temperature) {
      translated.generationConfig.temperature = request.temperature;
    }
    if (request.max_tokens) {
      translated.generationConfig.maxOutputTokens = request.max_tokens;
    }
    if (request.top_p) {
      translated.generationConfig.topP = request.top_p;
    }
    if (request.stop) {
      translated.generationConfig.stopSequences = Array.isArray(request.stop) ? request.stop : [request.stop];
    }

    return translated;
  }

  translateOpenAIMessages(messages) {
    return messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));
  }

  mapModel(model) {
    const modelMap = {
      'gpt-4': 'gemini-pro',
      'gpt-4-turbo': 'gemini-pro',
      'gpt-3.5-turbo': 'gemini-pro',
      'claude-3-opus-20240229': 'gemini-pro',
      'claude-3-sonnet-20240229': 'gemini-pro'
    };

    return modelMap[model] || this.defaultModel;
  }
}

module.exports = GoogleTranslator;