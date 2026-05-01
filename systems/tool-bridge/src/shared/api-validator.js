/**
 * API Validator
 * Test and validate API connections
 */

const axios = require('axios');
// const ora = require('ora'); // Currently unused

class APIValidator {
  constructor(configManager) {
    this.config = configManager;
    this.validators = {
      openai: this.validateOpenAI.bind(this),
      anthropic: this.validateAnthropic.bind(this),
      google: this.validateGoogle.bind(this)
    };
  }

  async testAll(specificAPI = null) {
    const results = [];
    const apis = specificAPI ? { [specificAPI]: this.config.get(`apis.${specificAPI}`) }
      : this.config.get('apis');

    for (const [name, config] of Object.entries(apis)) {
      if (typeof config === 'object' && !Array.isArray(config)) {
        if (config.enabled && this.validators[name]) {
          const result = await this.test(name, config);
          results.push(result);
        }
      }
    }

    return results;
  }

  async test(apiName, config) {
    const startTime = Date.now();

    try {
      await this.validators[apiName](config);

      return {
        name: apiName,
        success: true,
        message: 'Connection successful',
        latency: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: apiName,
        success: false,
        message: error.message,
        latency: Date.now() - startTime
      };
    }
  }

  async validateOpenAI(config) {
    if (!config.apiKey) {
      throw new Error('API key not configured');
    }

    try {
      const response = await axios.get('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`
        },
        timeout: 5000
      });

      if (response.data && response.data.data) {
        return true;
      }

      throw new Error('Invalid response from OpenAI API');
    } catch (error) {
      if (error.response) {
        if (error.response.status === 401) {
          throw new Error('Invalid API key');
        } else if (error.response.status === 429) {
          throw new Error('Rate limit exceeded');
        }
      }
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  async validateAnthropic(config) {
    if (!config.apiKey) {
      throw new Error('API key not configured');
    }

    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1
        },
        {
          headers: {
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          timeout: 5000
        }
      );

      if (response.data) {
        return true;
      }

      throw new Error('Invalid response from Anthropic API');
    } catch (error) {
      if (error.response) {
        if (error.response.status === 401) {
          throw new Error('Invalid API key');
        } else if (error.response.status === 429) {
          throw new Error('Rate limit exceeded');
        } else if (error.response.status === 400) {
          // This is actually okay - means auth worked but request was minimal
          return true;
        }
      }
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }

  async validateGoogle(config) {
    if (!config.apiKey) {
      throw new Error('API key not configured');
    }

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${config.apiKey}`,
        {
          contents: [{
            parts: [{ text: 'test' }]
          }]
        },
        {
          timeout: 5000
        }
      );

      if (response.data) {
        return true;
      }

      throw new Error('Invalid response from Google AI API');
    } catch (error) {
      if (error.response) {
        if (error.response.status === 401 || error.response.status === 403) {
          throw new Error('Invalid API key');
        } else if (error.response.status === 429) {
          throw new Error('Rate limit exceeded');
        }
      }
      throw new Error(`Google AI API error: ${error.message}`);
    }
  }

  async quickTest(provider, apiKey) {
    // Quick test for setup wizard
    const testConfig = { apiKey, enabled: true };

    try {
      await this.validators[provider](testConfig);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = APIValidator;