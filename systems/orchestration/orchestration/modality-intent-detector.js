/**
 * BUMBA Modality Intent Detector
 * Detects user intent to trigger specific team modalities and execution modes
 * Uses NLP-based keyword and pattern matching for natural language understanding
 */

const { EventEmitter } = require('events');

class ModalityIntentDetector extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      enablePatternMatching: config.enablePatternMatching !== false,
      enableContextAwareness: config.enableContextAwareness !== false,
      enableLearning: config.enableLearning !== false,
      defaultConfidenceThreshold: config.defaultConfidenceThreshold || 0.5,
      autoSelectThreshold: config.autoSelectThreshold || 0.8,
      suggestThreshold: config.suggestThreshold || 0.5,
      ...config
    };

    // Keyword mappings for 5 modalities
    this.modalityKeywords = {
      solo: {
        keywords: [
          'solo', 'single', 'alone', 'one manager', 'simple',
          'quick', 'straightforward', 'basic', 'individual',
          'direct', 'single domain', 'one agent'
        ],
        patterns: [
          /\bsolo\s+(mode|execution|manager)\b/i,
          /\bsingle\s+(agent|manager|department)\b/i,
          /\bjust\s+(one|a single)\b/i,
          /\b(simple|quick|basic)\s+(task|implementation)\b/i
        ],
        weight: 1.0
      },

      orchestrated: {
        keywords: [
          'orchestrated', 'orchestrate', 'coordinate', 'complex',
          'multi-domain', 'multiple departments', 'all departments',
          'strategic', 'comprehensive', 'full team', 'coordinated',
          'hierarchical', 'product strategist', 'all managers',
          'complete system', 'end-to-end', 'full stack'
        ],
        patterns: [
          /\b(orchestrate|coordinate)\s+(all|multiple|the)\s+(teams?|departments?|managers?)\b/i,
          /\b(full|complete|end-to-end)\s+(system|solution|implementation)\b/i,
          /\bmulti[- ]domain\b/i,
          /\b(backend|frontend|design)\s+and\s+(backend|frontend|design)\b/i,
          /\ball\s+(departments?|teams?|managers?)\s+(together|involved)\b/i
        ],
        weight: 1.2
      },

      sequential: {
        keywords: [
          'sequential', 'sequence', 'step-by-step', 'step by step',
          'one after another', 'in order', 'pipeline', 'phased',
          'phases', 'stage', 'stages', 'waterfall', 'progressive',
          'one at a time', 'series', 'chain', 'handoff'
        ],
        patterns: [
          /\bstep[- ]by[- ]step\b/i,
          /\bone\s+(after|at a time)\b/i,
          /\b(first|then|next|finally|after that)\b.*\b(then|next|after|finally)\b/i,
          /\bin\s+(sequence|order|phases?|stages?)\b/i,
          /\bphase\s+\d+/i
        ],
        weight: 1.0
      },

      parallel: {
        keywords: [
          'parallel', 'concurrent', 'simultaneously', 'at once',
          'at the same time', 'together', 'all at once', 'concurrently',
          'distributed', 'multiple agents', 'parallel execution',
          'side by side', 'multiple tasks', 'independent tasks'
        ],
        patterns: [
          /\b(at the same time|simultaneously|concurrently)\b/i,
          /\b(all|multiple)\s+(at once|together)\b/i,
          /\brun\s+in\s+parallel\b/i,
          /\b(side[- ]by[- ]side|parallel)\s+(execution|processing)\b/i,
          /\b(multiple|several)\s+(agents?|tasks?)\s+(at once|simultaneously|together)\b/i
        ],
        weight: 1.0
      },

      review: {
        keywords: [
          'review', 'validate', 'validation', 'check', 'audit',
          'inspect', 'examine', 'assess', 'evaluate', 'verify',
          'quality check', 'qa', 'quality assurance', 'code review',
          'peer review', 'sanity check', 'double check'
        ],
        patterns: [
          /\b(review|validate|check|audit|inspect)\s+(this|the|my|our)\s+(code|work|implementation|solution)\b/i,
          /\b(is\s+this|does\s+this|should\s+i)\b.*\b(correct|right|good|ok|okay)\b/i,
          /\bcode\s+review\b/i,
          /\bquality\s+(check|assurance|validation)\b/i,
          /\b(look|looks)\s+(good|correct|right)\b/i
        ],
        weight: 1.1
      }
    };

    // Keyword mappings for 8 execution modes
    this.modeKeywords = {
      adversarial: {
        keywords: [
          'adversarial', 'debate', 'challenge', 'argue', 'conflict',
          'opposing views', 'pros and cons', 'different perspectives',
          'critical analysis', 'advocate', 'critic', 'challenge assumptions'
        ],
        patterns: [
          /\b(pros?\s+and\s+cons?|advantages?\s+and\s+disadvantages?)\b/i,
          /\b(debate|challenge|argue)\s+(this|the|approach|solution)\b/i,
          /\b(different|opposing|conflicting)\s+(perspectives?|views?|opinions?)\b/i
        ],
        weight: 1.0
      },

      lite: {
        keywords: [
          'lite', 'light', 'fast', 'quick', 'simple', 'minimal',
          'lightweight', 'efficient', 'rapid', 'basic', 'streamlined',
          'no frills', 'bare bones'
        ],
        patterns: [
          /\b(as\s+)?(fast|quick|simple)\s+as\s+possible\b/i,
          /\bjust\s+(a\s+)?(quick|fast|simple)\b/i,
          /\bno\s+(frills?|overhead|complexity)\b/i,
          /\b(bare|minimal)\s+bones?\b/i
        ],
        weight: 1.0
      },

      turbo: {
        keywords: [
          'turbo', 'maximum speed', 'fastest', 'urgent', 'rush',
          'as fast as possible', 'asap', 'high priority', 'speed',
          'accelerated', 'rapid', 'express'
        ],
        patterns: [
          /\b(asap|urgent|rush|emergency)\b/i,
          /\b(maximum|max)\s+(speed|performance)\b/i,
          /\b(as\s+fast|fastest|quickest)\s+possible\b/i,
          /\bhigh\s+priority\b/i
        ],
        weight: 1.0
      },

      paranoid: {
        keywords: [
          'paranoid', 'security', 'secure', 'security audit',
          'vulnerability', 'threat', 'security analysis', 'penetration test',
          'security check', 'security review', 'compliance', 'secure code',
          'security scan', 'thorough security', 'maximum security'
        ],
        patterns: [
          /\bsecurity\s+(audit|check|review|analysis|scan|test)\b/i,
          /\b(vulnerability|penetration)\s+test(ing)?\b/i,
          /\b(security|compliance)\s+(issues?|concerns?|requirements?)\b/i,
          /\b(maximum|thorough|complete)\s+security\b/i
        ],
        weight: 1.2
      },

      swarm: {
        keywords: [
          'swarm', 'swarm intelligence', 'multiple perspectives',
          'diverse views', 'different angles', 'various perspectives',
          'collective intelligence', 'wisdom of crowds', 'consensus',
          'group thinking', 'multiple viewpoints'
        ],
        patterns: [
          /\bswarm\s+intelligence\b/i,
          /\b(multiple|many|various|diverse)\s+(perspectives?|viewpoints?|angles?)\b/i,
          /\b(collective|group)\s+(intelligence|thinking|wisdom)\b/i,
          /\bwisdom\s+of\s+(the\s+)?crowds?\b/i
        ],
        weight: 1.0
      },

      executive: {
        keywords: [
          'executive', 'executive mode', 'department manager',
          'manager control', 'executive decision', 'executive oversight',
          'strategic control', 'manager authority'
        ],
        patterns: [
          /\bexecutive\s+(mode|control|decision|oversight)\b/i,
          /\b(department|manager)\s+(control|oversight|authority)\b/i
        ],
        weight: 1.0
      },

      conscious: {
        keywords: [
          'conscious', 'four pillars', 'holistic', 'comprehensive validation',
          'knowledge purpose reason wisdom', 'deep validation',
          'complete validation', 'thorough check', 'full alignment'
        ],
        patterns: [
          /\bfour\s+pillars?\b/i,
          /\b(knowledge|purpose|reason|wisdom)\b.*\b(knowledge|purpose|reason|wisdom)\b/i,
          /\b(holistic|comprehensive|complete)\s+(validation|check|analysis)\b/i
        ],
        weight: 1.0
      },

      '360': {
        keywords: [
          '360', '360 degree', '360 analysis', '360 review',
          'complete analysis', 'all angles', 'comprehensive analysis',
          'full analysis', 'every angle', 'complete perspective',
          'thorough analysis', 'holistic analysis'
        ],
        patterns: [
          /\b360[- ]?(degree|analysis|review)\b/i,
          /\b(all|every)\s+(angles?|perspectives?|aspects?)\b/i,
          /\b(complete|comprehensive|thorough|holistic)\s+(analysis|review)\b/i
        ],
        weight: 1.1
      }
    };

    // Multi-criteria detection factors
    this.multiCriteriaWeights = {
      complexity: 0.25,      // Task complexity factor
      domainCount: 0.20,     // Number of domains involved
      urgency: 0.15,         // Urgency level
      precision: 0.15,       // Precision requirements
      collaboration: 0.15,   // Collaboration needs
      innovation: 0.10       // Innovation/creativity level
    };

    // Fuzzy matching configuration
    this.fuzzyMatchConfig = {
      enabled: config.enableFuzzyMatching !== false,
      maxDistance: config.fuzzyMaxDistance || 2,        // Max Levenshtein distance
      minSimilarity: config.fuzzyMinSimilarity || 0.75, // Min similarity threshold (0-1)
      typoWeight: config.fuzzyTypoWeight || 0.7         // Weight for fuzzy matches vs exact
    };

    // Enhanced edge case pattern library
    this.edgeCasePatterns = {
      // Compound phrase patterns ("both X and Y", "neither X nor Y")
      compound: {
        bothAnd: /\bboth\s+(\w+)\s+and\s+(\w+)\b/i,
        neitherNor: /\bneither\s+(\w+)\s+nor\s+(\w+)\b/i,
        eitherOr: /\beither\s+(\w+)\s+or\s+(\w+)\b/i,
        asWellAs: /\b(\w+)\s+as\s+well\s+as\s+(\w+)\b/i,
        notOnlyButAlso: /\bnot\s+only\s+(\w+)\s+but\s+(also\s+)?(\w+)\b/i
      },

      // Negation detection patterns ("not X", "don't want", "without")
      negation: {
        notPattern: /\b(?:not|don't|dont|do not|doesn't|doesnt|does not)\s+(\w+(?:\s+\w+)?)\b/i,
        withoutPattern: /\bwithout\s+(\w+(?:\s+\w+)?)\b/i,
        avoidPattern: /\b(?:avoid|skip|exclude|omit)\s+(\w+(?:\s+\w+)?)\b/i,
        noPattern: /\bno\s+(\w+(?:\s+\w+)?)\b/i,
        neverPattern: /\bnever\s+(?:use|do|run)\s+(\w+(?:\s+\w+)?)\b/i
      },

      // Comparison patterns ("X vs Y", "X versus Y", "compare X and Y")
      comparison: {
        versus: /\b(\w+(?:\s+\w+)?)\s+(?:vs\.?|versus)\s+(\w+(?:\s+\w+)?)\b/i,
        compare: /\bcompare\s+(\w+(?:\s+\w+)?)\s+(?:and|with|to)\s+(\w+(?:\s+\w+)?)\b/i,
        between: /\b(?:between|choose between)\s+(\w+(?:\s+\w+)?)\s+and\s+(\w+(?:\s+\w+)?)\b/i,
        difference: /\b(?:difference|differences)\s+between\s+(\w+(?:\s+\w+)?)\s+and\s+(\w+(?:\s+\w+)?)\b/i,
        better: /\b(?:which|what)(?:\s+is)?\s+better[,:]?\s+(\w+(?:\s+\w+)?)\s+or\s+(\w+(?:\s+\w+)?)\b/i
      },

      // Conditional patterns ("if X then Y", "when X do Y")
      conditional: {
        ifThen: /\bif\s+(.+?)\s+then\s+(.+?)(?:\.|$)/i,
        whenDo: /\bwhen\s+(.+?)\s+(?:do|use|execute)\s+(.+?)(?:\.|$)/i,
        unlessDo: /\bunless\s+(.+?)\s+(?:do|use|execute)\s+(.+?)(?:\.|$)/i,
        inCaseOf: /\bin\s+case\s+of\s+(.+?)\s+(?:do|use|execute)\s+(.+?)(?:\.|$)/i
      },

      // Question-based patterns for intent clarification
      question: {
        whatIf: /\bwhat\s+if\s+(.+?)\??$/i,
        shouldI: /\bshould\s+(?:i|we)\s+(.+?)\??$/i,
        howAbout: /\bhow\s+about\s+(.+?)\??$/i,
        canYou: /\bcan\s+you\s+(.+?)\??$/i,
        wouldYou: /\bwould\s+you\s+(.+?)\??$/i,
        isItPossible: /\bis\s+it\s+possible\s+to\s+(.+?)\??$/i,
        doYouThink: /\bdo\s+you\s+think\s+(.+?)\??$/i
      },

      // Preference indicators ("I prefer", "I'd rather", "I like")
      preference: {
        prefer: /\b(?:i|we|i'd|we'd)\s+prefer\s+(.+?)(?:\.|$)/i,
        rather: /\b(?:i'd|we'd|i would|we would)\s+rather\s+(.+?)(?:\.|$)/i,
        like: /\b(?:i|we)\s+(?:like|love)\s+(?:to\s+)?(.+?)(?:\.|$)/i,
        want: /\b(?:i|we)\s+want\s+(?:to\s+)?(.+?)(?:\.|$)/i,
        need: /\b(?:i|we)\s+need\s+(?:to\s+)?(.+?)(?:\.|$)/i
      },

      // Intensity modifiers ("very", "extremely", "somewhat")
      intensity: {
        high: /\b(?:very|extremely|highly|absolutely|definitely|certainly|completely)\s+(\w+)\b/i,
        medium: /\b(?:fairly|quite|pretty|reasonably|moderately)\s+(\w+)\b/i,
        low: /\b(?:somewhat|slightly|a bit|a little|kind of|sort of)\s+(\w+)\b/i
      }
    };

    // Detection history for learning
    this.detectionHistory = [];

    // Conversation history tracking (last 10 commands)
    this.conversationHistory = [];
    this.maxHistoryLength = config.maxHistoryLength || 10;

    // User preferences (learned over time)
    this.userPreferences = {
      modality: {},
      mode: {}
    };

    // Context-aware boosting factors
    this.contextBoosts = {
      recentUsage: 0.2,        // Boost for recently used modalities
      frequentUsage: 0.15,     // Boost for frequently used modalities
      similarContext: 0.1      // Boost for similar conversation context
    };

    // Confidence scoring structure
    this.confidenceLevels = {
      high: 0.8,      // Auto-select
      medium: 0.5,    // Suggest to user
      low: 0.3        // Use default fallback
    };
  }

  /**
   * Detect modality from user prompt
   * @param {string} prompt - User's natural language prompt
   * @param {Object} context - Additional context (history, preferences, etc.)
   * @returns {Object} Detection result with modality, confidence, and reasoning
   */
  detectModality(prompt, context = {}) {
    if (!prompt || typeof prompt !== 'string') {
      return this.createDetectionResult('solo', 0, 'default', 'Invalid prompt');
    }

    logger.debug('[ModalityIntentDetector] Detecting modality from prompt');

    // Normalize prompt: lowercase and clean whitespace
    let normalizedPrompt = prompt.toLowerCase().replace(/\s+/g, ' ').trim();

    // Detect and correct common typos
    const typoCheck = this.detectCommonTypos(normalizedPrompt);
    if (typoCheck.hasCorrectedTypos) {
      normalizedPrompt = typoCheck.correctedPrompt;
      logger.info(`[ModalityIntentDetector] Typos corrected: ${typoCheck.corrections.map(c => `"${c.typo}"->"${c.correct}"`).join(', ')}`);
    }

    let scores = {};

    // Score each modality based on keyword matches
    for (const [modality, config] of Object.entries(this.modalityKeywords)) {
      scores[modality] = this.scoreModalityKeywords(normalizedPrompt, config);
    }

    // Apply context-aware boosting
    scores = this.applyContextBoost(scores, 'modality');

    // Analyze edge case patterns
    const edgeCaseAnalysis = this.analyzeEdgeCasePatterns(normalizedPrompt);

    // Apply edge case adjustments
    scores = this.applyEdgeCaseAdjustments(scores, edgeCaseAnalysis);

    // Analyze multi-criteria factors
    const multiCriteriaAnalysis = this.analyzeMultiCriteria(normalizedPrompt);

    // Apply multi-criteria adjustments
    scores = this.applyMultiCriteriaAdjustments(scores, multiCriteriaAnalysis);

    // Find highest scoring modality
    const sortedScores = Object.entries(scores)
      .sort((a, b) => b[1] - a[1]);

    const [topModality, topScore] = sortedScores[0];

    // If no keywords matched, check for special cases
    if (topScore === 0) {
      const specialCase = this.detectSpecialCase(normalizedPrompt);
      if (specialCase) {
        return specialCase;
      }
      // Default to solo for simple tasks
      return this.createDetectionResult('solo', 0.5, 'default', 'No specific modality detected, defaulting to solo');
    }

    // Calculate confidence (0-1 scale)
    const confidence = this.calculateConfidence(topScore, sortedScores);

    // Build reasoning
    const reasoning = this.buildReasoning(topModality, topScore, sortedScores);

    // Create result
    const result = this.createDetectionResult(
      topModality,
      confidence,
      'keyword-match',
      reasoning
    );

    // Record detection for learning
    this.recordDetection('modality', prompt, result);

    // Emit detection event
    this.emit('modality:detected', result);

    return result;
  }

  /**
   * Detect special case modalities with enhanced scenarios
   */
  detectSpecialCase(normalizedPrompt) {
    // Check for hybrid scenarios (needs multiple modalities)
    const hybridScenario = this.detectHybridScenario(normalizedPrompt);
    if (hybridScenario) {
      return hybridScenario;
    }

    // Check for review/validation intent
    const reviewIndicators = ['?', 'should i', 'is this', 'looks good', 'correct', 'verify', 'validate'];
    if (reviewIndicators.some(indicator => normalizedPrompt.includes(indicator))) {
      return this.createDetectionResult('review', 0.6, 'special-case', 'Question or validation intent detected');
    }

    // Check for multi-domain indicators
    const multiDomainIndicators = ['backend and frontend', 'ui and api', 'full stack', 'complete system', 'end to end'];
    if (multiDomainIndicators.some(indicator => normalizedPrompt.includes(indicator))) {
      return this.createDetectionResult('orchestrated', 0.7, 'special-case', 'Multi-domain requirement detected');
    }

    // Check for exploratory/brainstorming scenarios
    const exploratoryIndicators = ['explore', 'brainstorm', 'ideas', 'possibilities', 'options'];
    if (exploratoryIndicators.some(indicator => normalizedPrompt.includes(indicator))) {
      return this.createDetectionResult('parallel', 0.65, 'special-case', 'Exploratory/brainstorming scenario detected');
    }

    // Check for refactoring scenarios
    const refactoringIndicators = ['refactor', 'improve', 'optimize', 'clean up', 'rewrite'];
    if (refactoringIndicators.some(indicator => normalizedPrompt.includes(indicator))) {
      return this.createDetectionResult('sequential', 0.65, 'special-case', 'Refactoring scenario detected');
    }

    // Check for ambiguous scenarios
    const ambiguity = this.detectAmbiguity(normalizedPrompt);
    if (ambiguity) {
      return ambiguity;
    }

    return null;
  }

  /**
   * Detect hybrid scenarios requiring multiple modalities
   */
  detectHybridScenario(normalizedPrompt) {
    const hybridPatterns = [
      {
        pattern: /\b(build|create)\s+and\s+(then\s+)?(review|validate|test)\b/i,
        modality: 'sequential',
        reason: 'Build-then-review hybrid detected'
      },
      {
        pattern: /\b(parallel|simultaneously)\s+.+\s+(coordinate|orchestrate)\b/i,
        modality: 'orchestrated',
        reason: 'Parallel-orchestrated hybrid detected'
      },
      {
        pattern: /\b(quick|fast)\s+.+\s+(comprehensive|thorough)\b/i,
        modality: 'orchestrated',
        reason: 'Speed-thoroughness hybrid detected (favoring orchestrated)'
      }
    ];

    for (const { pattern, modality, reason } of hybridPatterns) {
      if (pattern.test(normalizedPrompt)) {
        logger.debug(`[ModalityIntentDetector] ${reason}`);
        return this.createDetectionResult(modality, 0.7, 'hybrid-case', reason);
      }
    }

    return null;
  }

  /**
   * Detect ambiguous scenarios and provide suggestions
   */
  detectAmbiguity(normalizedPrompt) {
    const wordCount = normalizedPrompt.split(' ').length;

    // Too short to determine intent
    if (wordCount < 3) {
      return {
        ...this.createDetectionResult('solo', 0.3, 'ambiguous', 'Prompt too short to determine intent'),
        isAmbiguous: true,
        suggestions: [
          'Provide more details about the task',
          'Specify if multiple domains are involved',
          'Indicate urgency or complexity level'
        ]
      };
    }

    // Contains contradictory indicators
    const hasParallel = /\b(parallel|simultaneously|at once)\b/.test(normalizedPrompt);
    const hasSequential = /\b(sequential|step-by-step|one after another)\b/.test(normalizedPrompt);

    if (hasParallel && hasSequential) {
      return {
        ...this.createDetectionResult('orchestrated', 0.5, 'ambiguous', 'Contradictory indicators detected'),
        isAmbiguous: true,
        alternatives: ['parallel', 'sequential', 'orchestrated'],
        suggestions: [
          'Clarify if tasks should run parallel or sequential',
          'Consider orchestrated mode for mixed approach'
        ]
      };
    }

    return null;
  }

  /**
   * Generate alternative suggestions for low-confidence detections
   */
  generateAlternatives(topModality, sortedScores, confidence) {
    const alternatives = [];

    // If confidence is medium-low, suggest top 3 options
    if (confidence < 0.65) {
      for (let i = 0; i < Math.min(3, sortedScores.length); i++) {
        const [modality, score] = sortedScores[i];
        if (score > 0) {
          alternatives.push({
            modality,
            score,
            confidence: score / (sortedScores[0][1] || 1),
            reason: `Alternative option based on keyword matches`
          });
        }
      }
    }

    return alternatives;
  }

  /**
   * Determine if fallback is needed
   */
  shouldUseFallback(confidence, scores) {
    // Use fallback if confidence is very low
    if (confidence < 0.3) {
      return { should: true, reason: 'Confidence too low' };
    }

    // Use fallback if all scores are very low
    const maxScore = Math.max(...Object.values(scores));
    if (maxScore < 2) {
      return { should: true, reason: 'All scores very low' };
    }

    // Use fallback if scores are very close (ambiguous)
    const sortedScores = Object.values(scores).sort((a, b) => b - a);
    if (sortedScores.length >= 2) {
      const topTwo = sortedScores.slice(0, 2);
      const diff = topTwo[0] - topTwo[1];
      if (diff < 0.5 && topTwo[0] > 0) {
        return { should: true, reason: 'Scores too close - ambiguous' };
      }
    }

    return { should: false };
  }

  /**
   * Detect execution mode from user prompt
   * @param {string} prompt - User's natural language prompt
   * @param {Object} context - Additional context
   * @returns {Object} Detection result with mode, confidence, and reasoning
   */
  detectMode(prompt, context = {}) {
    if (!prompt || typeof prompt !== 'string') {
      return this.createDetectionResult('standard', 0, 'default', 'Invalid prompt');
    }

    logger.debug('[ModalityIntentDetector] Detecting mode from prompt');

    // Normalize prompt: lowercase and clean whitespace
    let normalizedPrompt = prompt.toLowerCase().replace(/\s+/g, ' ').trim();

    // Detect and correct common typos
    const typoCheck = this.detectCommonTypos(normalizedPrompt);
    if (typoCheck.hasCorrectedTypos) {
      normalizedPrompt = typoCheck.correctedPrompt;
      logger.info(`[ModalityIntentDetector] Typos corrected: ${typoCheck.corrections.map(c => `"${c.typo}"->"${c.correct}"`).join(', ')}`);
    }

    let scores = {};

    // Score each mode based on keyword and pattern matches
    for (const [mode, config] of Object.entries(this.modeKeywords)) {
      scores[mode] = this.scoreModalityKeywords(normalizedPrompt, config);
    }

    // Apply context-aware boosting
    scores = this.applyContextBoost(scores, 'mode');

    // Analyze edge case patterns
    const edgeCaseAnalysis = this.analyzeEdgeCasePatterns(normalizedPrompt);

    // Apply edge case adjustments
    scores = this.applyEdgeCaseAdjustments(scores, edgeCaseAnalysis);

    // Analyze multi-criteria factors
    const multiCriteriaAnalysis = this.analyzeMultiCriteria(normalizedPrompt);

    // Apply multi-criteria adjustments
    scores = this.applyMultiCriteriaAdjustments(scores, multiCriteriaAnalysis);

    // Find highest scoring mode
    const sortedScores = Object.entries(scores)
      .sort((a, b) => b[1] - a[1]);

    const [topMode, topScore] = sortedScores[0];

    // Check for special case modes
    if (topScore === 0) {
      const specialMode = this.detectSpecialModeCase(normalizedPrompt);
      if (specialMode) {
        return specialMode;
      }
      // Default to standard mode
      return this.createDetectionResult('standard', 0.5, 'default', 'No specific mode detected, using standard');
    }

    // Calculate confidence
    const confidence = this.calculateConfidence(topScore, sortedScores);

    // Build reasoning
    const reasoning = this.buildReasoning(topMode, topScore, sortedScores);

    // Create result
    const result = this.createDetectionResult(
      topMode,
      confidence,
      'keyword-match',
      reasoning
    );

    // Record detection
    this.recordDetection('mode', prompt, result);

    // Emit detection event
    this.emit('mode:detected', result);

    return result;
  }

  /**
   * Detect special case execution modes
   */
  detectSpecialModeCase(normalizedPrompt) {
    // Detect paranoid/security mode from security-related keywords
    const securityKeywords = ['hack', 'exploit', 'attack', 'breach', 'secure', 'safety'];
    if (securityKeywords.some(kw => normalizedPrompt.includes(kw))) {
      return this.createDetectionResult('paranoid', 0.7, 'special-case', 'Security-related keywords detected');
    }

    // Detect turbo mode from urgency indicators
    const urgencyKeywords = ['urgent', 'asap', 'immediately', 'now', 'hurry'];
    if (urgencyKeywords.some(kw => normalizedPrompt.includes(kw))) {
      return this.createDetectionResult('turbo', 0.7, 'special-case', 'Urgency detected');
    }

    // Detect 360 mode from comprehensive analysis indicators
    const comprehensiveKeywords = ['all aspects', 'every angle', 'thoroughly', 'completely'];
    if (comprehensiveKeywords.some(kw => normalizedPrompt.includes(kw))) {
      return this.createDetectionResult('360', 0.6, 'special-case', 'Comprehensive analysis request detected');
    }

    return null;
  }

  /**
   * Detect both modality and mode in one call
   * @param {string} prompt - User's natural language prompt
   * @param {Object} context - Additional context
   * @returns {Object} Combined detection results
   */
  detectBoth(prompt, context = {}) {
    const modalityResult = this.detectModality(prompt, context);
    const modeResult = this.detectMode(prompt, context);

    return {
      modality: modalityResult,
      mode: modeResult,
      combined: {
        confidence: (modalityResult.confidence + modeResult.confidence) / 2,
        shouldAutoSelect: modalityResult.confidence >= this.config.autoSelectThreshold ||
                         modeResult.confidence >= this.config.autoSelectThreshold
      }
    };
  }

  /**
   * Analyze prompt for edge case patterns
   * Returns analysis of compound phrases, negations, comparisons, etc.
   */
  analyzeEdgeCasePatterns(normalizedPrompt) {
    const analysis = {
      hasCompound: false,
      hasNegation: false,
      hasComparison: false,
      hasConditional: false,
      hasQuestion: false,
      hasPreference: false,
      intensity: 'normal',
      details: {}
    };

    // Check for compound phrases
    for (const [key, pattern] of Object.entries(this.edgeCasePatterns.compound)) {
      const match = normalizedPrompt.match(pattern);
      if (match) {
        analysis.hasCompound = true;
        analysis.details.compound = { type: key, matches: match.slice(1) };
        logger.debug(`[ModalityIntentDetector] Compound phrase detected: ${key}`);
        break;
      }
    }

    // Check for negations
    for (const [key, pattern] of Object.entries(this.edgeCasePatterns.negation)) {
      const match = normalizedPrompt.match(pattern);
      if (match) {
        analysis.hasNegation = true;
        analysis.details.negation = { type: key, target: match[1] };
        logger.debug(`[ModalityIntentDetector] Negation detected: ${key} - avoiding "${match[1]}"`);
        break;
      }
    }

    // Check for comparisons
    for (const [key, pattern] of Object.entries(this.edgeCasePatterns.comparison)) {
      const match = normalizedPrompt.match(pattern);
      if (match) {
        analysis.hasComparison = true;
        analysis.details.comparison = { type: key, options: [match[1], match[2]] };
        logger.debug(`[ModalityIntentDetector] Comparison detected: ${match[1]} vs ${match[2]}`);
        break;
      }
    }

    // Check for conditionals
    for (const [key, pattern] of Object.entries(this.edgeCasePatterns.conditional)) {
      const match = normalizedPrompt.match(pattern);
      if (match) {
        analysis.hasConditional = true;
        analysis.details.conditional = { type: key, condition: match[1], action: match[2] };
        logger.debug(`[ModalityIntentDetector] Conditional detected: if ${match[1]} then ${match[2]}`);
        break;
      }
    }

    // Check for questions
    for (const [key, pattern] of Object.entries(this.edgeCasePatterns.question)) {
      const match = normalizedPrompt.match(pattern);
      if (match) {
        analysis.hasQuestion = true;
        analysis.details.question = { type: key, content: match[1] };
        logger.debug(`[ModalityIntentDetector] Question detected: ${key}`);
        break;
      }
    }

    // Check for preferences
    for (const [key, pattern] of Object.entries(this.edgeCasePatterns.preference)) {
      const match = normalizedPrompt.match(pattern);
      if (match) {
        analysis.hasPreference = true;
        analysis.details.preference = { type: key, content: match[1] };
        logger.debug(`[ModalityIntentDetector] Preference detected: ${key}`);
        break;
      }
    }

    // Check for intensity modifiers
    for (const [level, pattern] of Object.entries(this.edgeCasePatterns.intensity)) {
      const match = normalizedPrompt.match(pattern);
      if (match) {
        analysis.intensity = level;
        analysis.details.intensity = { level, modifier: match[0], target: match[1] };
        logger.debug(`[ModalityIntentDetector] Intensity modifier detected: ${level} - "${match[0]}"`);
        break;
      }
    }

    return analysis;
  }

  /**
   * Apply edge case adjustments to scores based on pattern analysis
   */
  applyEdgeCaseAdjustments(scores, analysis) {
    let adjustedScores = { ...scores };

    // If negation detected, reduce score for negated option
    if (analysis.hasNegation && analysis.details.negation) {
      const target = analysis.details.negation.target.toLowerCase();
      for (const [key, score] of Object.entries(adjustedScores)) {
        if (key.includes(target) || target.includes(key)) {
          adjustedScores[key] = Math.max(0, score * 0.3); // Reduce by 70%
          logger.debug(`[ModalityIntentDetector] Negation penalty applied to "${key}"`);
        }
      }
    }

    // If comparison detected, boost adversarial mode
    if (analysis.hasComparison) {
      if (adjustedScores.adversarial !== undefined) {
        adjustedScores.adversarial += 2;
        logger.debug('[ModalityIntentDetector] Comparison boost applied to adversarial mode');
      }
    }

    // If question detected, boost review modality
    if (analysis.hasQuestion) {
      if (adjustedScores.review !== undefined) {
        adjustedScores.review += 1.5;
        logger.debug('[ModalityIntentDetector] Question boost applied to review modality');
      }
    }

    // If conditional detected, boost sequential modality
    if (analysis.hasConditional) {
      if (adjustedScores.sequential !== undefined) {
        adjustedScores.sequential += 1.5;
        logger.debug('[ModalityIntentDetector] Conditional boost applied to sequential modality');
      }
    }

    // If compound phrase detected, boost orchestrated/parallel
    if (analysis.hasCompound) {
      if (adjustedScores.orchestrated !== undefined) {
        adjustedScores.orchestrated += 1;
      }
      if (adjustedScores.parallel !== undefined) {
        adjustedScores.parallel += 1;
      }
      logger.debug('[ModalityIntentDetector] Compound phrase boost applied');
    }

    // Apply intensity adjustments
    if (analysis.intensity !== 'normal') {
      const multiplier = analysis.intensity === 'high' ? 1.2 : analysis.intensity === 'low' ? 0.8 : 1.0;
      for (const key in adjustedScores) {
        if (adjustedScores[key] > 0) {
          adjustedScores[key] *= multiplier;
        }
      }
      logger.debug(`[ModalityIntentDetector] Intensity adjustment (${analysis.intensity}) applied: ${multiplier}x`);
    }

    return adjustedScores;
  }

  /**
   * Analyze multiple criteria for comprehensive detection
   * Returns scores for complexity, domain count, urgency, etc.
   */
  analyzeMultiCriteria(normalizedPrompt) {
    const criteria = {
      complexity: this.analyzeComplexity(normalizedPrompt),
      domainCount: this.analyzeDomainCount(normalizedPrompt),
      urgency: this.analyzeUrgency(normalizedPrompt),
      precision: this.analyzePrecision(normalizedPrompt),
      collaboration: this.analyzeCollaboration(normalizedPrompt),
      innovation: this.analyzeInnovation(normalizedPrompt)
    };

    // Calculate weighted composite score
    let compositeScore = 0;
    for (const [criterion, score] of Object.entries(criteria)) {
      compositeScore += score * this.multiCriteriaWeights[criterion];
    }

    return {
      criteria,
      compositeScore,
      dominantFactor: this.getDominantFactor(criteria)
    };
  }

  /**
   * Analyze task complexity (0-10)
   */
  analyzeComplexity(normalizedPrompt) {
    let score = 0;

    // Complex keywords
    const complexKeywords = [
      'complex', 'complicated', 'intricate', 'sophisticated',
      'advanced', 'comprehensive', 'extensive', 'detailed',
      'multi-step', 'multi-layer', 'end-to-end'
    ];

    for (const keyword of complexKeywords) {
      if (normalizedPrompt.includes(keyword)) {
        score += 2;
      }
    }

    // Simple keywords (reduce score)
    const simpleKeywords = ['simple', 'basic', 'quick', 'easy', 'straightforward'];
    for (const keyword of simpleKeywords) {
      if (normalizedPrompt.includes(keyword)) {
        score -= 2;
      }
    }

    // Word count indicator (longer = potentially more complex)
    const wordCount = normalizedPrompt.split(' ').length;
    if (wordCount > 30) score += 2;
    else if (wordCount > 20) score += 1;

    // Multiple steps indicator
    if (/\b(first|then|next|after|finally)\b/.test(normalizedPrompt)) {
      score += 2;
    }

    return Math.max(0, Math.min(score, 10));
  }

  /**
   * Analyze domain count (0-10)
   */
  analyzeDomainCount(normalizedPrompt) {
    const domains = [
      { name: 'frontend', patterns: ['frontend', 'ui', 'ux', 'interface', 'react', 'vue', 'angular'] },
      { name: 'backend', patterns: ['backend', 'api', 'server', 'database', 'node', 'express'] },
      { name: 'design', patterns: ['design', 'figma', 'wireframe', 'mockup', 'prototype'] },
      { name: 'data', patterns: ['data', 'analytics', 'sql', 'database', 'query'] },
      { name: 'devops', patterns: ['devops', 'deploy', 'ci', 'cd', 'docker', 'kubernetes'] },
      { name: 'testing', patterns: ['test', 'qa', 'quality', 'jest', 'cypress'] }
    ];

    let domainsDetected = 0;
    for (const domain of domains) {
      if (domain.patterns.some(pattern => normalizedPrompt.includes(pattern))) {
        domainsDetected++;
      }
    }

    return Math.min(domainsDetected * 2, 10);
  }

  /**
   * Analyze urgency level (0-10)
   */
  analyzeUrgency(normalizedPrompt) {
    const urgencyKeywords = {
      critical: ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'now'],
      high: ['soon', 'quick', 'fast', 'rapid', 'hurry'],
      normal: ['normal', 'standard', 'regular']
    };

    if (urgencyKeywords.critical.some(kw => normalizedPrompt.includes(kw))) {
      return 10;
    }
    if (urgencyKeywords.high.some(kw => normalizedPrompt.includes(kw))) {
      return 7;
    }
    if (urgencyKeywords.normal.some(kw => normalizedPrompt.includes(kw))) {
      return 3;
    }

    return 5; // Default medium urgency
  }

  /**
   * Analyze precision requirements (0-10)
   */
  analyzePrecision(normalizedPrompt) {
    const precisionKeywords = {
      high: ['exact', 'precise', 'accurate', 'perfect', 'flawless', 'rigorous', 'thorough'],
      low: ['rough', 'approximate', 'ballpark', 'estimate', 'quick and dirty']
    };

    let score = 5; // Default medium precision

    if (precisionKeywords.high.some(kw => normalizedPrompt.includes(kw))) {
      score += 3;
    }
    if (precisionKeywords.low.some(kw => normalizedPrompt.includes(kw))) {
      score -= 3;
    }

    // Questions often indicate need for precision
    if (/\?/.test(normalizedPrompt)) {
      score += 2;
    }

    return Math.max(0, Math.min(score, 10));
  }

  /**
   * Analyze collaboration needs (0-10)
   */
  analyzeCollaboration(normalizedPrompt) {
    const collaborationKeywords = [
      'team', 'collaborate', 'together', 'coordinate', 'multiple',
      'all departments', 'cross-functional', 'integrate', 'shared'
    ];

    let score = 0;
    for (const keyword of collaborationKeywords) {
      if (normalizedPrompt.includes(keyword)) {
        score += 2;
      }
    }

    // Solo indicators
    if (/\b(solo|single|alone|one|individual)\b/.test(normalizedPrompt)) {
      score -= 3;
    }

    return Math.max(0, Math.min(score, 10));
  }

  /**
   * Analyze innovation/creativity level (0-10)
   */
  analyzeInnovation(normalizedPrompt) {
    const innovationKeywords = [
      'innovative', 'creative', 'novel', 'new', 'experimental',
      'brainstorm', 'explore', 'discover', 'invent', 'original'
    ];

    let score = 0;
    for (const keyword of innovationKeywords) {
      if (normalizedPrompt.includes(keyword)) {
        score += 2;
      }
    }

    // Question marks often indicate exploration
    const questionCount = (normalizedPrompt.match(/\?/g) || []).length;
    score += questionCount;

    return Math.max(0, Math.min(score, 10));
  }

  /**
   * Get dominant factor from multi-criteria analysis
   */
  getDominantFactor(criteria) {
    let maxScore = 0;
    let dominant = 'balanced';

    for (const [factor, score] of Object.entries(criteria)) {
      if (score > maxScore) {
        maxScore = score;
        dominant = factor;
      }
    }

    return { factor: dominant, score: maxScore };
  }

  /**
   * Apply multi-criteria adjustments to scores
   */
  applyMultiCriteriaAdjustments(scores, multiCriteriaAnalysis) {
    let adjustedScores = { ...scores };
    const { criteria, dominantFactor } = multiCriteriaAnalysis;

    // High complexity -> boost orchestrated/sequential
    if (criteria.complexity >= 7) {
      if (adjustedScores.orchestrated !== undefined) {
        adjustedScores.orchestrated += 2;
      }
      if (adjustedScores.sequential !== undefined) {
        adjustedScores.sequential += 1;
      }
      logger.debug('[ModalityIntentDetector] High complexity boost applied');
    }

    // Multiple domains -> boost orchestrated/parallel
    if (criteria.domainCount >= 4) {
      if (adjustedScores.orchestrated !== undefined) {
        adjustedScores.orchestrated += 2;
      }
      if (adjustedScores.parallel !== undefined) {
        adjustedScores.parallel += 1.5;
      }
      logger.debug('[ModalityIntentDetector] Multi-domain boost applied');
    }

    // High urgency -> boost turbo/lite modes
    if (criteria.urgency >= 7) {
      if (adjustedScores.turbo !== undefined) {
        adjustedScores.turbo += 2;
      }
      if (adjustedScores.lite !== undefined) {
        adjustedScores.lite += 1;
      }
      logger.debug('[ModalityIntentDetector] Urgency boost applied');
    }

    // High precision -> boost paranoid/360 modes
    if (criteria.precision >= 7) {
      if (adjustedScores.paranoid !== undefined) {
        adjustedScores.paranoid += 1.5;
      }
      if (adjustedScores['360'] !== undefined) {
        adjustedScores['360'] += 1.5;
      }
      logger.debug('[ModalityIntentDetector] Precision boost applied');
    }

    // High collaboration -> boost orchestrated/parallel
    if (criteria.collaboration >= 7) {
      if (adjustedScores.orchestrated !== undefined) {
        adjustedScores.orchestrated += 1.5;
      }
      if (adjustedScores.parallel !== undefined) {
        adjustedScores.parallel += 1;
      }
      logger.debug('[ModalityIntentDetector] Collaboration boost applied');
    }

    // High innovation -> boost conscious/adversarial modes
    if (criteria.innovation >= 6) {
      if (adjustedScores.conscious !== undefined) {
        adjustedScores.conscious += 1.5;
      }
      if (adjustedScores.adversarial !== undefined) {
        adjustedScores.adversarial += 1;
      }
      logger.debug('[ModalityIntentDetector] Innovation boost applied');
    }

    return adjustedScores;
  }

  /**
   * Calculate Levenshtein distance between two strings
   * Used for fuzzy matching and typo tolerance
   */
  levenshteinDistance(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // deletion
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Calculate similarity ratio between two strings (0-1)
   * Based on Levenshtein distance
   */
  calculateSimilarity(str1, str2) {
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1;
    return 1 - (distance / maxLength);
  }

  /**
   * Find fuzzy matches for a keyword in the prompt
   * Returns matches with similarity scores
   */
  findFuzzyMatches(normalizedPrompt, keyword) {
    if (!this.fuzzyMatchConfig.enabled) {
      return [];
    }

    const matches = [];
    const words = normalizedPrompt.split(' ');

    for (const word of words) {
      // Skip very short words
      if (word.length < 3) continue;

      const distance = this.levenshteinDistance(word, keyword);
      const similarity = this.calculateSimilarity(word, keyword);

      // If within acceptable distance/similarity
      if (distance <= this.fuzzyMatchConfig.maxDistance &&
          similarity >= this.fuzzyMatchConfig.minSimilarity) {
        matches.push({
          word,
          keyword,
          distance,
          similarity,
          score: similarity * this.fuzzyMatchConfig.typoWeight
        });

        logger.debug(`[ModalityIntentDetector] Fuzzy match: "${word}" ≈ "${keyword}" (similarity: ${similarity.toFixed(2)})`);
      }
    }

    return matches;
  }

  /**
   * Score keywords with fuzzy matching support
   * Handles typos and approximate matches
   */
  scoreKeywordsWithFuzzy(normalizedPrompt, keywords, weight) {
    let score = 0;
    const matchedKeywords = [];
    const fuzzyMatches = [];

    for (const keyword of keywords) {
      // Try exact match first (word boundary)
      if (this.hasWordBoundaryMatch(normalizedPrompt, keyword)) {
        const wordCount = keyword.split(' ').length;
        const keywordScore = wordCount * weight;
        score += keywordScore;

        matchedKeywords.push({ keyword, score: keywordScore, type: 'exact' });

        // Position bonus
        if (normalizedPrompt.startsWith(keyword) || normalizedPrompt.endsWith(keyword)) {
          score += 0.5 * weight;
        }
      } else if (this.fuzzyMatchConfig.enabled) {
        // Try fuzzy matching
        const matches = this.findFuzzyMatches(normalizedPrompt, keyword);
        if (matches.length > 0) {
          // Use best match
          const bestMatch = matches.reduce((best, current) =>
            current.similarity > best.similarity ? current : best
          );

          const fuzzyScore = bestMatch.score * weight;
          score += fuzzyScore;

          fuzzyMatches.push({
            keyword,
            match: bestMatch.word,
            score: fuzzyScore,
            similarity: bestMatch.similarity,
            type: 'fuzzy'
          });

          logger.debug(`[ModalityIntentDetector] Fuzzy match scored: "${bestMatch.word}" for "${keyword}" (+${fuzzyScore.toFixed(2)})`);
        }
      }
    }

    return { score, matchedKeywords, fuzzyMatches };
  }

  /**
   * Check for common typos and misspellings
   * Returns corrected version if typo detected
   */
  detectCommonTypos(normalizedPrompt) {
    const typoMap = {
      // Common misspellings of modalities
      'sequencial': 'sequential',
      'sequantial': 'sequential',
      'paralel': 'parallel',
      'paralell': 'parallel',
      'orchastrated': 'orchestrated',
      'orchestraded': 'orchestrated',
      'reveiw': 'review',
      'reivew': 'review',

      // Common misspellings of modes
      'adverserial': 'adversarial',
      'advesarial': 'adversarial',
      'concious': 'conscious',
      'consious': 'conscious',
      'paranoud': 'paranoid',
      'parinoid': 'paranoid',
      'exicutive': 'executive',
      'exectuive': 'executive'
    };

    let correctedPrompt = normalizedPrompt;
    const corrections = [];

    for (const [typo, correct] of Object.entries(typoMap)) {
      if (normalizedPrompt.includes(typo)) {
        correctedPrompt = correctedPrompt.replace(new RegExp(typo, 'g'), correct);
        corrections.push({ typo, correct });
        logger.debug(`[ModalityIntentDetector] Typo detected and corrected: "${typo}" → "${correct}"`);
      }
    }

    return {
      hasCorrectedTypos: corrections.length > 0,
      correctedPrompt,
      corrections
    };
  }

  /**
   * Score keywords for a modality/mode with advanced matching
   * Includes both keyword and pattern matching
   */
  scoreModalityKeywords(normalizedPrompt, config) {
    let score = 0;
    const { keywords, patterns, weight } = config;
    const matchedKeywords = [];
    const matchedPatterns = [];

    // Score keyword matches
    for (const keyword of keywords) {
      // Exact phrase match
      if (normalizedPrompt.includes(keyword)) {
        // Weight multi-word phrases higher (more specific)
        const wordCount = keyword.split(' ').length;
        const keywordScore = wordCount * weight;

        score += keywordScore;
        matchedKeywords.push({ keyword, score: keywordScore, type: 'exact' });

        // Bonus for phrase at start/end (stronger intent)
        if (normalizedPrompt.startsWith(keyword) || normalizedPrompt.endsWith(keyword)) {
          score += 0.5 * weight;
        }
      }
      // Word boundary match (prevent partial word matches)
      else if (this.hasWordBoundaryMatch(normalizedPrompt, keyword)) {
        const wordCount = keyword.split(' ').length;
        const keywordScore = wordCount * weight * 0.9; // Slightly lower than exact

        score += keywordScore;
        matchedKeywords.push({ keyword, score: keywordScore, type: 'boundary' });
      }
    }

    // Score pattern matches (weighted higher than keywords)
    if (patterns && patterns.length > 0) {
      for (const pattern of patterns) {
        if (pattern.test(normalizedPrompt)) {
          // Pattern matches are more specific, weight them higher
          const patternScore = 3 * weight; // Patterns worth 3x base weight

          score += patternScore;
          matchedPatterns.push({ pattern: pattern.source, score: patternScore, type: 'pattern' });

          logger.debug(`[ModalityIntentDetector] Pattern matched: ${pattern.source}`);
        }
      }
    }

    // Bonus for multiple keyword matches (stronger intent)
    if (matchedKeywords.length > 1) {
      score += matchedKeywords.length * 0.5 * weight;
    }

    // Extra bonus if both keywords AND patterns matched (very strong intent)
    if (matchedKeywords.length > 0 && matchedPatterns.length > 0) {
      score += 2 * weight;
      logger.debug('[ModalityIntentDetector] Both keywords and patterns matched - strong intent detected');
    }

    return score;
  }

  /**
   * Check for word boundary matches to avoid partial word matching
   */
  hasWordBoundaryMatch(text, keyword) {
    // Create regex with word boundaries
    const regex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'i');
    return regex.test(text);
  }

  /**
   * Escape special regex characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Calculate confidence score (0-1) with detailed breakdown
   */
  calculateConfidence(topScore, sortedScores) {
    if (topScore === 0) return 0;

    // Get second best score for comparison
    const secondScore = sortedScores.length > 1 ? sortedScores[1][1] : 0;

    // Confidence based on multiple factors:
    // 1. Absolute score strength (how many matches)
    // 2. Separation from second best (how clear the winner is)
    // 3. Score distribution (consensus vs. ambiguity)

    // Factor 1: Absolute score strength (0-1)
    // Strong scores (10+) get high confidence
    const absoluteConfidence = Math.min(topScore / 12, 1); // Normalize to 0-1, cap at 12

    // Factor 2: Separation from second best (0-1)
    // Large gap = high confidence
    const separation = secondScore === 0 ? 1 : Math.min((topScore - secondScore) / topScore, 1);

    // Factor 3: Score distribution analysis
    // If top score is much higher than average, increase confidence
    const avgScore = sortedScores.reduce((sum, [_, score]) => sum + score, 0) / sortedScores.length;
    const distributionFactor = topScore > 0 ? Math.min(topScore / (avgScore * 3), 1) : 0;

    // Weighted combination of all factors
    const baseConfidence = (
      absoluteConfidence * 0.5 +    // 50% weight on absolute strength
      separation * 0.3 +             // 30% weight on separation
      distributionFactor * 0.2       // 20% weight on distribution
    );

    // Apply confidence thresholds and bounds
    const confidence = Math.max(0, Math.min(baseConfidence, 1));

    logger.debug(`[ModalityIntentDetector] Confidence calculation: abs=${absoluteConfidence.toFixed(2)}, sep=${separation.toFixed(2)}, dist=${distributionFactor.toFixed(2)}, final=${confidence.toFixed(2)}`);

    return confidence;
  }

  /**
   * Get confidence level description
   */
  getConfidenceLevel(confidence) {
    if (confidence >= this.config.autoSelectThreshold) {
      return {
        level: 'high',
        description: 'Strong intent detected - auto-selecting',
        action: 'auto-select',
        emoji: ''
      };
    } else if (confidence >= this.config.suggestThreshold) {
      return {
        level: 'medium',
        description: 'Moderate intent detected - suggesting option',
        action: 'suggest',
        emoji: ''
      };
    } else {
      return {
        level: 'low',
        description: 'Weak or unclear intent - using default',
        action: 'default',
        emoji: ''
      };
    }
  }

  /**
   * Update confidence thresholds
   */
  updateConfidenceThresholds(thresholds) {
    if (thresholds.autoSelect !== undefined) {
      this.config.autoSelectThreshold = Math.max(0, Math.min(thresholds.autoSelect, 1));
    }
    if (thresholds.suggest !== undefined) {
      this.config.suggestThreshold = Math.max(0, Math.min(thresholds.suggest, 1));
    }

    logger.info('[ModalityIntentDetector] Confidence thresholds updated', {
      autoSelect: this.config.autoSelectThreshold,
      suggest: this.config.suggestThreshold
    });
  }

  /**
   * Build human-readable reasoning
   */
  buildReasoning(detected, score, sortedScores) {
    if (score === 0) {
      return `No specific ${detected} keywords detected, using default`;
    }

    const keywordCount = Math.floor(score);
    const alternatives = sortedScores
      .slice(1, 3)
      .filter(([_, s]) => s > 0)
      .map(([name, _]) => name);

    let reasoning = `Detected ${keywordCount} keyword match(es) for "${detected}"`;

    if (alternatives.length > 0) {
      reasoning += `. Other possibilities: ${alternatives.join(', ')}`;
    }

    return reasoning;
  }

  /**
   * Create standardized detection result
   */
  createDetectionResult(detected, confidence, method, reasoning) {
    const confidenceLevel = this.getConfidenceLevel(confidence);

    return {
      detected,
      confidence: Math.round(confidence * 100) / 100, // Round to 2 decimals
      confidenceLevel: confidenceLevel.level,
      confidenceDescription: confidenceLevel.description,
      confidenceEmoji: confidenceLevel.emoji,
      recommendedAction: confidenceLevel.action,
      method,
      reasoning,
      timestamp: Date.now(),
      shouldAutoSelect: confidence >= this.config.autoSelectThreshold,
      shouldSuggest: confidence >= this.config.suggestThreshold && confidence < this.config.autoSelectThreshold,
      shouldUseDefault: confidence < this.config.suggestThreshold,
      thresholds: {
        autoSelect: this.config.autoSelectThreshold,
        suggest: this.config.suggestThreshold
      }
    };
  }

  /**
   * Record detection for analytics and learning
   */
  recordDetection(type, prompt, result) {
    this.detectionHistory.push({
      type,
      prompt: prompt.substring(0, 100), // Store first 100 chars
      result: result.detected,
      confidence: result.confidence,
      timestamp: Date.now()
    });

    // Keep only last 100 detections
    if (this.detectionHistory.length > 100) {
      this.detectionHistory.shift();
    }

    // Add to conversation history for context awareness
    if (this.config.enableContextAwareness) {
      this.addToConversationHistory(type, result.detected, prompt);
    }

    // Learn user preferences
    if (this.config.enableLearning) {
      this.learnUserPreferences(type, result.detected);
    }
  }

  /**
   * Add command to conversation history
   */
  addToConversationHistory(type, detected, prompt) {
    this.conversationHistory.push({
      type,
      detected,
      prompt: prompt.substring(0, 50), // Store snippet
      timestamp: Date.now()
    });

    // Keep only last N commands
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory.shift();
    }

    logger.debug(`[ModalityIntentDetector] Added to conversation history: ${type}=${detected}`);
  }

  /**
   * Analyze recent usage patterns
   */
  analyzeRecentPatterns(type) {
    const recentCommands = this.conversationHistory
      .filter(cmd => cmd.type === type)
      .slice(-5); // Last 5 commands of this type

    if (recentCommands.length === 0) {
      return {};
    }

    // Count frequencies
    const frequencies = {};
    for (const cmd of recentCommands) {
      frequencies[cmd.detected] = (frequencies[cmd.detected] || 0) + 1;
    }

    // Get most recent
    const mostRecent = recentCommands[recentCommands.length - 1];

    return {
      mostRecent: mostRecent.detected,
      frequencies,
      totalRecent: recentCommands.length
    };
  }

  /**
   * Apply context-aware boost to scores
   */
  applyContextBoost(scores, type) {
    if (!this.config.enableContextAwareness) {
      return scores;
    }

    const patterns = this.analyzeRecentPatterns(type);
    const boostedScores = { ...scores };

    // Boost recently used options
    if (patterns.mostRecent && boostedScores[patterns.mostRecent] !== undefined) {
      const boost = boostedScores[patterns.mostRecent] * this.contextBoosts.recentUsage;
      boostedScores[patterns.mostRecent] += boost;

      logger.debug(`[ModalityIntentDetector] Context boost: ${patterns.mostRecent} +${boost.toFixed(2)} (recent usage)`);
    }

    // Boost frequently used options
    if (patterns.frequencies) {
      for (const [option, frequency] of Object.entries(patterns.frequencies)) {
        if (frequency > 1 && boostedScores[option] !== undefined) {
          const boost = boostedScores[option] * this.contextBoosts.frequentUsage * (frequency / patterns.totalRecent);
          boostedScores[option] += boost;

          logger.debug(`[ModalityIntentDetector] Context boost: ${option} +${boost.toFixed(2)} (frequent usage: ${frequency}/${patterns.totalRecent})`);
        }
      }
    }

    return boostedScores;
  }

  /**
   * Learn user preferences over time
   */
  learnUserPreferences(type, detected) {
    if (!this.userPreferences[type]) {
      this.userPreferences[type] = {};
    }

    if (!this.userPreferences[type][detected]) {
      this.userPreferences[type][detected] = {
        count: 0,
        lastUsed: null,
        preferenceScore: 0
      };
    }

    const pref = this.userPreferences[type][detected];
    pref.count++;
    pref.lastUsed = Date.now();

    // Calculate preference score (0-1) based on frequency and recency
    const totalCount = Object.values(this.userPreferences[type])
      .reduce((sum, p) => sum + p.count, 0);

    pref.preferenceScore = pref.count / totalCount;

    logger.debug(`[ModalityIntentDetector] Learned preference: ${type}=${detected} (score: ${pref.preferenceScore.toFixed(2)})`);
  }

  /**
   * Get memory integration data for persistence
   */
  getMemoryIntegrationData() {
    return {
      conversationHistory: this.conversationHistory.slice(-10),
      userPreferences: this.userPreferences,
      detectionStats: this.getStatistics(),
      timestamp: Date.now()
    };
  }

  /**
   * Load context from memory system
   */
  loadContextFromMemory(memoryData) {
    if (!memoryData) return;

    if (memoryData.conversationHistory) {
      this.conversationHistory = memoryData.conversationHistory;
      logger.info('[ModalityIntentDetector] Loaded conversation history from memory');
    }

    if (memoryData.userPreferences) {
      this.userPreferences = memoryData.userPreferences;
      logger.info('[ModalityIntentDetector] Loaded user preferences from memory');
    }
  }

  /**
   * Get detection statistics
   */
  getStatistics() {
    const modalityStats = {};
    const modeStats = {};

    for (const detection of this.detectionHistory) {
      const stats = detection.type === 'modality' ? modalityStats : modeStats;

      if (!stats[detection.result]) {
        stats[detection.result] = {
          count: 0,
          totalConfidence: 0,
          avgConfidence: 0
        };
      }

      stats[detection.result].count++;
      stats[detection.result].totalConfidence += detection.confidence;
      stats[detection.result].avgConfidence =
        stats[detection.result].totalConfidence / stats[detection.result].count;
    }

    return {
      totalDetections: this.detectionHistory.length,
      modalityStats,
      modeStats,
      recentDetections: this.detectionHistory.slice(-10)
    };
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return {
      ...this.config,
      modalitiesAvailable: Object.keys(this.modalityKeywords),
      modesAvailable: Object.keys(this.modeKeywords),
      confidenceLevels: this.confidenceLevels
    };
  }
}

module.exports = ModalityIntentDetector;
