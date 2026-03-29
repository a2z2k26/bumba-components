/**
 * Web Search Connector for BUMBA
 * Sprint 29: Handles multiple search providers (Google, Bing, DuckDuckGo)
 */

const EventEmitter = require('events');

class WebSearchConnector extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      provider: options.provider || 'duckduckgo', // Default to DuckDuckGo (no API key needed)
      googleApiKey: options.googleApiKey || process.env.GOOGLE_SEARCH_API_KEY,
      googleCseId: options.googleCseId || process.env.GOOGLE_CSE_ID,
      bingApiKey: options.bingApiKey || process.env.BING_API_KEY,
      braveApiKey: options.braveApiKey || process.env.BRAVE_API_KEY,
      timeout: options.timeout || 10000,
      ...options
    };
  }

  async search(query, options = {}) {
    const provider = options.provider || this.options.provider;
    
    switch (provider) {
      case 'google':
        return this.googleSearch(query, options);
      case 'bing':
        return this.bingSearch(query, options);
      case 'brave':
        return this.braveSearch(query, options);
      case 'duckduckgo':
      default:
        return this.duckDuckGoSearch(query, options);
    }
  }

  async googleSearch(query, options = {}) {
    if (!this.options.googleApiKey || !this.options.googleCseId) {
      throw new Error('Google Search API key and CSE ID required');
    }
    
    const params = new URLSearchParams({
      key: this.options.googleApiKey,
      cx: this.options.googleCseId,
      q: query,
      num: options.limit || 10,
      start: options.offset || 1
    });
    
    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?${params}`,
      { signal: AbortSignal.timeout(this.options.timeout) }
    );
    
    if (!response.ok) {
      throw new Error(`Google Search error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      provider: 'google',
      query,
      results: data.items?.map(item => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        source: item.displayLink
      })) || [],
      totalResults: data.searchInformation?.totalResults
    };
  }

  async bingSearch(query, options = {}) {
    if (!this.options.bingApiKey) {
      throw new Error('Bing API key required');
    }
    
    const params = new URLSearchParams({
      q: query,
      count: options.limit || 10,
      offset: options.offset || 0
    });
    
    const response = await fetch(
      `https://api.bing.microsoft.com/v7.0/search?${params}`,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': this.options.bingApiKey
        },
        signal: AbortSignal.timeout(this.options.timeout)
      }
    );
    
    if (!response.ok) {
      throw new Error(`Bing Search error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      provider: 'bing',
      query,
      results: data.webPages?.value?.map(item => ({
        title: item.name,
        url: item.url,
        snippet: item.snippet,
        source: item.displayUrl
      })) || [],
      totalResults: data.webPages?.totalEstimatedMatches
    };
  }

  async braveSearch(query, options = {}) {
    if (!this.options.braveApiKey) {
      throw new Error('Brave API key required');
    }
    
    const params = new URLSearchParams({
      q: query,
      count: options.limit || 10
    });
    
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      {
        headers: {
          'X-Subscription-Token': this.options.braveApiKey
        },
        signal: AbortSignal.timeout(this.options.timeout)
      }
    );
    
    if (!response.ok) {
      throw new Error(`Brave Search error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      provider: 'brave',
      query,
      results: data.web?.results?.map(item => ({
        title: item.title,
        url: item.url,
        snippet: item.description,
        source: new URL(item.url).hostname
      })) || []
    };
  }

  async duckDuckGoSearch(query, options = {}) {
    // DuckDuckGo doesn't have an official API, this uses their instant answer API
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      no_html: '1',
      skip_disambig: '1'
    });
    
    const response = await fetch(
      `https://api.duckduckgo.com/?${params}`,
      { signal: AbortSignal.timeout(this.options.timeout) }
    );
    
    if (!response.ok) {
      throw new Error(`DuckDuckGo Search error: ${response.status}`);
    }
    
    const data = await response.json();
    
    const results = [];
    
    // Add abstract if available
    if (data.AbstractURL) {
      results.push({
        title: data.Heading || 'Summary',
        url: data.AbstractURL,
        snippet: data.Abstract,
        source: data.AbstractSource
      });
    }
    
    // Add related topics
    data.RelatedTopics?.forEach(topic => {
      if (topic.FirstURL) {
        results.push({
          title: topic.Text?.split(' - ')[0] || 'Related',
          url: topic.FirstURL,
          snippet: topic.Text,
          source: 'DuckDuckGo'
        });
      }
    });
    
    return {
      provider: 'duckduckgo',
      query,
      results: results.slice(0, options.limit || 10)
    };
  }

  async imageSearch(query, options = {}) {
    // Implement image search based on provider
    const provider = options.provider || this.options.provider;
    
    if (provider === 'google' && this.options.googleApiKey) {
      const params = new URLSearchParams({
        key: this.options.googleApiKey,
        cx: this.options.googleCseId,
        q: query,
        searchType: 'image',
        num: options.limit || 10
      });
      
      const response = await fetch(
        `https://www.googleapis.com/customsearch/v1?${params}`,
        { signal: AbortSignal.timeout(this.options.timeout) }
      );
      
      const data = await response.json();
      
      return {
        provider: 'google',
        query,
        type: 'image',
        results: data.items?.map(item => ({
          title: item.title,
          url: item.link,
          thumbnailUrl: item.image?.thumbnailLink,
          sourceUrl: item.image?.contextLink,
          width: item.image?.width,
          height: item.image?.height
        })) || []
      };
    }
    
    throw new Error('Image search not available for this provider');
  }

  async newsSearch(query, options = {}) {
    const provider = options.provider || this.options.provider;
    
    if (provider === 'bing' && this.options.bingApiKey) {
      const params = new URLSearchParams({
        q: query,
        count: options.limit || 10
      });
      
      const response = await fetch(
        `https://api.bing.microsoft.com/v7.0/news/search?${params}`,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.options.bingApiKey
          },
          signal: AbortSignal.timeout(this.options.timeout)
        }
      );
      
      const data = await response.json();
      
      return {
        provider: 'bing',
        query,
        type: 'news',
        results: data.value?.map(item => ({
          title: item.name,
          url: item.url,
          snippet: item.description,
          source: item.provider?.[0]?.name,
          publishedAt: item.datePublished,
          thumbnail: item.image?.thumbnail?.contentUrl
        })) || []
      };
    }
    
    // Fallback to regular search with news filter
    return this.search(`${query} news`, options);
  }
}

module.exports = WebSearchConnector;