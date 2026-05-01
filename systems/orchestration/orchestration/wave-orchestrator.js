/**
 * BUMBA Wave Orchestrator
 * Coordinates multi-wave parallel agent execution with consolidation phases
 * This is where the "swarm intelligence" becomes real
 */

const { EventEmitter } = require('events');
const { MLNLPIntegration } = require('./ml-nlp-integration');
const { ConsolidationStrategies } = require('./consolidation-strategies');

class WaveOrchestrator extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.parallelSystem = new ParallelAgentSystem(config);
    this.waveHistory = [];
    this.currentWave = null;
    
    // Wave configuration
    this.config = {
      maxWaves: config.maxWaves || 5,
      consolidationStrategy: config.consolidationStrategy || 'consensus',
      parallelThreshold: config.parallelThreshold || 2, // Min tasks to run parallel
      enableLearning: config.enableLearning !== false,
      enableNLP: config.enableNLP !== false,
      enableML: config.enableML !== false
    };
    
    // Learning system - patterns that work well
    this.patterns = {
      successful: [],
      failed: []
    };

    // Initialize ML/NLP systems using extracted module
    const mlnlp = new MLNLPIntegration();
    this.nlpSystem = mlnlp.nlpSystem;
    this.mlIntegration = mlnlp.mlIntegration;
    this.semanticAnalyzer = mlnlp.semanticAnalyzer;

    // Initialize Consolidation Strategies using extracted module
    this.consolidationStrategies = new ConsolidationStrategies(this.mlIntegration, this.semanticAnalyzer);

    // Pattern Recognition (uses consolidation strategies)
    this.patternRecognition = this.consolidationStrategies.initializePatternRecognition();

    // Intelligent Consolidation (uses consolidation strategies)
    this.intelligentConsolidation = this.consolidationStrategies.initializeIntelligentConsolidation();
  }
  
  /**
   * Execute a full feature development with wave orchestration
   * This is the main entry point for complex multi-agent tasks
   */
  async orchestrateFeature(requirement, options = {}) {
    logger.info(`🟢 Starting wave orchestration for: ${requirement}`);
    
    const orchestration = {
      id: `orch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      requirement,
      waves: [],
      startTime: Date.now(),
      status: 'in_progress'
    };
    
    try {
      // Wave 1: Analysis & Discovery
      const wave1Results = await this.executeWave('analysis', [
        {
          agent: 'product',
          prompt: `Analyze requirements and create user stories for: ${requirement}`,
          model: 'claude'
        },
        {
          agent: 'design',
          prompt: `Research design patterns and UI/UX considerations for: ${requirement}`,
          model: 'claude'
        },
        {
          agent: 'backend',
          prompt: `Assess technical feasibility and architecture for: ${requirement}`,
          model: 'claude'
        },
        {
          agent: 'security',
          prompt: `Identify security requirements and concerns for: ${requirement}`,
          model: 'claude'
        }
      ]);
      
      orchestration.waves.push(wave1Results);
      
      // Consolidation Phase 1
      const analysisConsolidation = await this.consolidateResults(wave1Results.results, 'analysis');
      
      // Wave 2: Planning & Design
      const wave2Results = await this.executeWave('planning', [
        {
          agent: 'product',
          prompt: `Create detailed PRD based on analysis: ${JSON.stringify(analysisConsolidation.summary)}`,
          model: 'claude'
        },
        {
          agent: 'design',
          prompt: `Design component architecture and UI mockups for: ${JSON.stringify(analysisConsolidation.design)}`,
          model: 'claude'
        },
        {
          agent: 'backend',
          prompt: `Design API architecture and data models for: ${JSON.stringify(analysisConsolidation.technical)}`,
          model: 'claude'
        }
      ]);
      
      orchestration.waves.push(wave2Results);
      
      // Consolidation Phase 2
      const planConsolidation = await this.consolidateResults(wave2Results.results, 'planning');
      
      // Wave 3: Implementation
      const wave3Results = await this.executeWave('implementation', [
        {
          agent: 'frontend',
          prompt: `Implement React components based on design: ${JSON.stringify(planConsolidation.design)}`,
          model: 'claude'
        },
        {
          agent: 'backend',
          prompt: `Implement API endpoints and business logic: ${JSON.stringify(planConsolidation.api)}`,
          model: 'claude'
        },
        {
          agent: 'database',
          prompt: `Create database schema and migrations: ${JSON.stringify(planConsolidation.dataModel)}`,
          model: 'claude'
        }
      ]);
      
      orchestration.waves.push(wave3Results);
      
      // Consolidation Phase 3
      const implementationConsolidation = await this.consolidateResults(wave3Results.results, 'implementation');
      
      // Wave 4: Testing & Validation
      const wave4Results = await this.executeWave('validation', [
        {
          agent: 'testing',
          prompt: `Create comprehensive test suite for: ${JSON.stringify(implementationConsolidation.components)}`,
          model: 'claude'
        },
        {
          agent: 'security',
          prompt: `Perform security audit on implementation: ${JSON.stringify(implementationConsolidation.code)}`,
          model: 'claude'
        },
        {
          agent: 'devops',
          prompt: `Create deployment configuration and CI/CD pipeline: ${JSON.stringify(implementationConsolidation.infrastructure)}`,
          model: 'claude'
        }
      ]);
      
      orchestration.waves.push(wave4Results);
      
      // Final Consolidation
      const finalConsolidation = await this.consolidateResults(wave4Results.results, 'final');
      
      // Mark as complete
      orchestration.status = 'completed';
      orchestration.endTime = Date.now();
      orchestration.totalTime = orchestration.endTime - orchestration.startTime;
      orchestration.result = finalConsolidation;
      
      // Learn from this orchestration
      if (this.config.enableLearning) {
        await this.learnFromOrchestration(orchestration);
      }
      
      // Store in history
      this.waveHistory.push(orchestration);
      
      logger.info(`🏁 Wave orchestration completed in ${orchestration.totalTime}ms`);
      
      return orchestration;
      
    } catch (error) {
      orchestration.status = 'failed';
      orchestration.error = error.message;
      orchestration.endTime = Date.now();
      
      logger.error(`🔴 Wave orchestration failed: ${error.message}`);
      
      this.waveHistory.push(orchestration);
      throw error;
    }
  }
  
  /**
   * Execute a single wave of parallel agents
   */
  async executeWave(waveType, tasks) {
    logger.info(`🟢 Executing ${waveType} wave with ${tasks.length} parallel agents`);
    
    this.currentWave = {
      type: waveType,
      tasks: tasks.length,
      startTime: Date.now()
    };
    
    this.emit('wave:start', this.currentWave);
    
    // Decide whether to run parallel or sequential based on threshold
    let results;
    if (tasks.length >= this.config.parallelThreshold) {
      results = await this.parallelSystem.executeParallel(tasks);
    } else {
      // Fall back to sequential for small task sets
      results = await this.executeSequential(tasks);
    }
    
    this.currentWave.endTime = Date.now();
    this.currentWave.duration = this.currentWave.endTime - this.currentWave.startTime;
    this.currentWave.results = results;
    
    this.emit('wave:complete', this.currentWave);
    
    return {
      type: waveType,
      ...results,
      duration: this.currentWave.duration
    };
  }
  
  /**
   * Consolidate results from multiple agents with ML optimization
   */
  async consolidateResults(results, phase) {
    logger.info(`🟢 Consolidating ${results.length} agent results for ${phase} phase`);
    
    const consolidation = {
      phase,
      timestamp: Date.now(),
      summary: '',
      consensus: {},
      conflicts: [],
      recommendations: [],
      mlInsights: {},
      semanticAnalysis: {},
      confidence: 0
    };
    
    // Apply ML-enhanced consolidation if available
    if (this.config.enableML && this.mlIntegration.enabled) {
      const mlConsolidation = await this.consolidationStrategies.mlEnhancedConsolidation(results, phase);
      Object.assign(consolidation, mlConsolidation);
    }

    // Apply semantic analysis if available
    if (this.config.enableNLP && this.semanticAnalyzer.enabled) {
      consolidation.semanticAnalysis = await this.consolidationStrategies.performSemanticAnalysis(results);
    }
    
    // Extract successful results
    const successfulResults = results.filter(r => r.success);
    
    if (successfulResults.length === 0) {
      throw new Error(`No successful results to consolidate in ${phase} phase`);
    }
    
    // Enhanced strategy-based consolidation
    switch (this.config.consolidationStrategy) {
      case 'consensus':
        consolidation.consensus = await this.findConsensus(successfulResults);
        break;
      case 'merge':
        consolidation.merged = await this.mergeResults(successfulResults);
        break;
      case 'vote':
        consolidation.voted = await this.voteOnResults(successfulResults);
        break;
      case 'ml-optimized':
        consolidation.optimized = await this.mlOptimizedConsolidation(successfulResults);
        break;
      case 'semantic':
        consolidation.semantic = await this.semanticConsolidation(successfulResults);
        break;
      case 'hybrid':
        consolidation.hybrid = await this.hybridConsolidation(successfulResults);
        break;
      default:
        consolidation.all = successfulResults;
    }
    
    // Apply pattern recognition
    if (this.patternRecognition.enabled) {
      consolidation.patterns = await this.recognizePatterns(successfulResults, phase);
    }
    
    // Extract key information based on phase
    switch (phase) {
      case 'analysis':
        consolidation.summary = this.extractAnalysisSummary(successfulResults);
        consolidation.design = this.extractDesignRequirements(successfulResults);
        consolidation.technical = this.extractTechnicalRequirements(successfulResults);
        break;
      case 'planning':
        consolidation.design = this.extractDesignPlans(successfulResults);
        consolidation.api = this.extractAPIDesign(successfulResults);
        consolidation.dataModel = this.extractDataModel(successfulResults);
        break;
      case 'implementation':
        consolidation.components = this.extractComponents(successfulResults);
        consolidation.code = this.extractCode(successfulResults);
        consolidation.infrastructure = this.extractInfrastructure(successfulResults);
        break;
      case 'final':
        consolidation.deliverables = this.extractDeliverables(successfulResults);
        consolidation.documentation = this.extractDocumentation(successfulResults);
        consolidation.deployment = this.extractDeployment(successfulResults);
        break;
    }
    
    return consolidation;
  }
  
  /**
   * Find consensus among agent results with ML enhancement
   */
  async findConsensus(results) {
    const consensus = {
      agreements: [],
      disagreements: [],
      confidence: 0,
      method: 'standard'
    };
    
    // Use ML consensus if available
    if (this.config.enableML && this.mlIntegration.consensus) {
      return await this.mlConsensus(results);
    }
    
    // Enhanced consensus with semantic similarity
    const semanticGroups = await this.groupBySemantic(results);
    
    // Find largest agreement group
    const largestGroup = semanticGroups.sort((a, b) => b.members.length - a.members.length)[0];
    
    if (largestGroup) {
      consensus.agreements = largestGroup.commonPoints;
      consensus.confidence = largestGroup.members.length / results.length;
      consensus.semanticScore = largestGroup.similarity;
    }
    
    // Identify disagreements
    consensus.disagreements = await this.identifyDisagreements(semanticGroups);
    
    return consensus;
  }
  
  /**
   * Merge results from multiple agents
   */
  async mergeResults(results) {
    return {
      merged: results.map(r => ({
        agent: r.agent,
        content: r.result
      })),
      count: results.length
    };
  }
  
  /**
   * Vote on best results
   */
  async voteOnResults(results) {
    // In a real system, this could use another AI call to judge
    // For now, we'll use execution time as a proxy for quality
    const sorted = results.sort((a, b) => a.executionTime - b.executionTime);
    return {
      winner: sorted[0],
      runnerUp: sorted[1] || null
    };
  }
  
  /**
   * Extract key points from text with NLP
   */
  async extractKeyPoints(text) {
    if (this.config.enableNLP && this.nlpSystem.enabled) {
      return await this.nlpExtractKeyPoints(text);
    }
    
    // Fallback to intelligent text processing
    return this.intelligentTextExtraction(text);
  }
  
  async nlpExtractKeyPoints(text) {
    const analysis = await this.nlpSystem.analyze(text);
    
    return {
      keywords: analysis.keywords || [],
      entities: analysis.entities || [],
      sentiments: analysis.sentiments || {},
      topics: analysis.topics || [],
      summary: analysis.summary || text.substring(0, 200),
      confidence: analysis.confidence || 0.7
    };
  }
  
  intelligentTextExtraction(text) {
    // Advanced fallback without NLP APIs
    const sentences = this.splitIntoSentences(text);
    const keywords = this.extractKeywordsHeuristic(text);
    const entities = this.extractEntitiesPattern(text);
    
    return {
      keywords,
      entities,
      sentences: sentences.slice(0, 3),
      summary: sentences.slice(0, 2).join(' '),
      confidence: 0.6
    };
  }
  
  /**
   * Phase-specific extraction methods
   */
  extractAnalysisSummary(results) {
    return results.map(r => r.result.substring(0, 200)).join('\n');
  }
  
  extractDesignRequirements(results) {
    const designResult = results.find(r => r.agent === 'design');
    return designResult ? designResult.result : '';
  }
  
  extractTechnicalRequirements(results) {
    const techResult = results.find(r => r.agent === 'backend');
    return techResult ? techResult.result : '';
  }
  
  extractDesignPlans(results) {
    const designResult = results.find(r => r.agent === 'design');
    return designResult ? designResult.result : '';
  }
  
  extractAPIDesign(results) {
    const apiResult = results.find(r => r.agent === 'backend');
    return apiResult ? apiResult.result : '';
  }
  
  extractDataModel(results) {
    const backendResult = results.find(r => r.agent === 'backend');
    return backendResult ? backendResult.result : '';
  }
  
  extractComponents(results) {
    const frontendResult = results.find(r => r.agent === 'frontend');
    return frontendResult ? frontendResult.result : '';
  }
  
  extractCode(results) {
    return results.map(r => r.result).join('\n\n');
  }
  
  extractInfrastructure(results) {
    const devopsResult = results.find(r => r.agent === 'devops');
    return devopsResult ? devopsResult.result : '';
  }
  
  extractDeliverables(results) {
    return results.map(r => ({
      agent: r.agent,
      deliverable: r.result.substring(0, 500)
    }));
  }
  
  extractDocumentation(results) {
    return results.map(r => r.result).join('\n\n---\n\n');
  }
  
  extractDeployment(results) {
    const devopsResult = results.find(r => r.agent === 'devops');
    return devopsResult ? devopsResult.result : '';
  }
  
  /**
   * Sequential execution fallback
   */
  async executeSequential(tasks) {
    const results = [];
    for (const task of tasks) {
      try {
        const result = await this.parallelSystem.executeSingleAgent(task);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          task
        });
      }
    }
    
    return {
      results,
      metadata: {
        executionTime: results.reduce((sum, r) => sum + (r.executionTime || 0), 0),
        parallelTasks: 0,
        sequentialTasks: tasks.length
      }
    };
  }
  
  /**
   * Learn from orchestration patterns
   */
  async learnFromOrchestration(orchestration) {
    if (orchestration.status === 'completed') {
      this.patterns.successful.push({
        requirement: orchestration.requirement,
        waveCount: orchestration.waves.length,
        totalTime: orchestration.totalTime,
        timestamp: Date.now()
      });
    } else {
      this.patterns.failed.push({
        requirement: orchestration.requirement,
        error: orchestration.error,
        timestamp: Date.now()
      });
    }
    
    // Keep only recent patterns (last 100)
    this.patterns.successful = this.patterns.successful.slice(-100);
    this.patterns.failed = this.patterns.failed.slice(-100);
  }
  
  /**
   * Get orchestration status
   */
  getStatus() {
    return {
      currentWave: this.currentWave,
      historyCount: this.waveHistory.length,
      patterns: {
        successful: this.patterns.successful.length,
        failed: this.patterns.failed.length
      },
      parallelSystemStatus: this.parallelSystem.getStatus()
    };
  }
  
  /**
   * Get orchestration history
   */
  getHistory(limit = 10) {
    return this.waveHistory.slice(-limit);
  }
  
  /**
   * Clean shutdown
   */
  async shutdown() {
    logger.info('🟢 Shutting down Wave Orchestrator');
    await this.parallelSystem.shutdown();
    
    // Cleanup NLP resources
    if (this.nlpSystem.enabled) {
      await this.nlpSystem.cleanup();
    }
    
    // Cleanup ML resources
    if (this.mlIntegration.enabled) {
      await this.mlIntegration.cleanup();
    }
    
    this.removeAllListeners();
  }
  
  

  // ========== HELPER METHODS ==========
  
  splitIntoSentences(text) {
    // Split text into sentences
    return text.match(/[^.!?]+[.!?]+/g) || [text];
  }
  
  extractKeywordsHeuristic(text) {
    // Extract keywords using heuristics
    const words = text.toLowerCase().split(/\s+/);
    const wordFreq = new Map();
    
    for (const word of words) {
      if (word.length > 4) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    }
    
    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }
  
  extractEntitiesPattern(text) {
    // Extract entities using patterns
    const entities = [];
    
    // Capital words (potential names/places)
    const capitalWords = text.match(/[A-Z][a-z]+/g) || [];
    entities.push(...capitalWords.map(w => ({ type: 'NAME', value: w })));
    
    // Numbers
    const numbers = text.match(/\d+/g) || [];
    entities.push(...numbers.map(n => ({ type: 'NUMBER', value: n })));
    
    // URLs
    const urls = text.match(/https?:\/\/[^\s]+/g) || [];
    entities.push(...urls.map(u => ({ type: 'URL', value: u })));
    
    return entities;
  }
}

// Export singleton
let instance = null;

module.exports = {
  WaveOrchestrator,
  getInstance: (config) => {
    if (!instance) {
      instance = new WaveOrchestrator(config);
    }
    return instance;
  }
};