/**
 * Pinecone Vector Database Connector for BUMBA
 * Sprint 28: Handles vector database operations
 */

const EventEmitter = require('events');

class PineconeConnector extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      apiKey: options.apiKey || process.env.PINECONE_API_KEY,
      environment: options.environment || process.env.PINECONE_ENVIRONMENT,
      projectName: options.projectName || process.env.PINECONE_PROJECT,
      timeout: options.timeout || 30000,
      ...options
    };
    
    if (!this.options.apiKey) {
      throw new Error('Pinecone API key is required');
    }
    
    this.baseURL = `https://${this.options.projectName}-${this.options.environment}.svc.pinecone.io`;
  }

  async makeRequest(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseURL}${endpoint}`;
    
    const headers = {
      'Api-Key': this.options.apiKey,
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(this.options.timeout)
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Pinecone API error: ${response.status}`);
    }
    
    return response.json();
  }

  async createIndex(name, dimension, options = {}) {
    return this.makeRequest('/indexes', {
      method: 'POST',
      body: {
        name,
        dimension,
        metric: options.metric || 'cosine',
        ...options
      }
    });
  }

  async describeIndex(indexName) {
    return this.makeRequest(`/indexes/${indexName}`);
  }

  async listIndexes() {
    return this.makeRequest('/indexes');
  }

  async deleteIndex(indexName) {
    return this.makeRequest(`/indexes/${indexName}`, {
      method: 'DELETE'
    });
  }

  async upsert(indexName, vectors, namespace = '') {
    const indexURL = `https://${indexName}-${this.options.projectName}.svc.${this.options.environment}.pinecone.io`;
    
    return this.makeRequest(`${indexURL}/vectors/upsert`, {
      method: 'POST',
      body: {
        vectors,
        namespace
      }
    });
  }

  async query(indexName, vector, options = {}) {
    const indexURL = `https://${indexName}-${this.options.projectName}.svc.${this.options.environment}.pinecone.io`;
    
    return this.makeRequest(`${indexURL}/query`, {
      method: 'POST',
      body: {
        vector,
        topK: options.topK || 10,
        includeValues: options.includeValues || false,
        includeMetadata: options.includeMetadata || true,
        namespace: options.namespace || '',
        filter: options.filter
      }
    });
  }

  async deleteVectors(indexName, ids, namespace = '') {
    const indexURL = `https://${indexName}-${this.options.projectName}.svc.${this.options.environment}.pinecone.io`;
    
    return this.makeRequest(`${indexURL}/vectors/delete`, {
      method: 'POST',
      body: {
        ids,
        namespace
      }
    });
  }

  async fetch(indexName, ids, namespace = '') {
    const indexURL = `https://${indexName}-${this.options.projectName}.svc.${this.options.environment}.pinecone.io`;
    
    return this.makeRequest(`${indexURL}/vectors/fetch?ids=${ids.join(',')}&namespace=${namespace}`);
  }
}

module.exports = PineconeConnector;