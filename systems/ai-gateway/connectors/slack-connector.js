/**
 * Slack API Connector for BUMBA
 * Sprint 26: Handles Slack workspace interactions
 */

const EventEmitter = require('events');

class SlackConnector extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      token: options.token || process.env.SLACK_TOKEN,
      baseURL: options.baseURL || 'https://slack.com/api',
      timeout: options.timeout || 30000,
      ...options
    };

    if (!this.options.token) {
      throw new Error('Slack token is required');
    }
  }

  async makeRequest(method, params = {}) {
    const url = `${this.options.baseURL}/${method}`;
    const headers = {
      'Authorization': `Bearer ${this.options.token}`,
      'Content-Type': 'application/json'
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(this.options.timeout)
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || 'Slack API error');
    }

    return data;
  }

  async postMessage(channel, text, options = {}) {
    return this.makeRequest('chat.postMessage', {
      channel,
      text,
      ...options
    });
  }

  async listChannels() {
    return this.makeRequest('conversations.list');
  }

  async getUserInfo(userId) {
    return this.makeRequest('users.info', { user: userId });
  }

  async uploadFile(channels, file, options = {}) {
    return this.makeRequest('files.upload', {
      channels,
      file,
      ...options
    });
  }
}

module.exports = SlackConnector;