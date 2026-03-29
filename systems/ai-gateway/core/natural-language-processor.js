/**
 * Enhanced Natural Language Processor
 * Sprint 5.5: Advanced NLP for conversational spec creation
 *
 * Extends the base NLP processor with:
 * - Intent detection (feature, bug, enhancement, etc.)
 * - Conversational context tracking
 * - Structured spec generation from dialogue
 */

// [OPTIONAL] const BaseNLPProcessor = require('../spec-driven/nlp-processor'); // May need @bumba/* package

/**
 * Intent types for spec creation
 */
const IntentType = {
  FEATURE_REQUEST: 'feature_request',
  BUG_REPORT: 'bug_report',
  ENHANCEMENT: 'enhancement',
  REFACTOR: 'refactor',
  DOCUMENTATION: 'documentation',
  TESTING: 'testing',
  CONFIGURATION: 'configuration',
  DEPLOYMENT: 'deployment',
  INVESTIGATION: 'investigation',
  QUESTION: 'question',
  UNKNOWN: 'unknown'
};

/**
 * Spec types mapping from intents
 */
const IntentToSpecType = {
  [IntentType.FEATURE_REQUEST]: 'feature',
  [IntentType.BUG_REPORT]: 'bug',
  [IntentType.ENHANCEMENT]: 'enhancement',
  [IntentType.REFACTOR]: 'refactor',
  [IntentType.DOCUMENTATION]: 'docs',
  [IntentType.TESTING]: 'test',
  [IntentType.CONFIGURATION]: 'config',
  [IntentType.DEPLOYMENT]: 'deployment',
  [IntentType.INVESTIGATION]: 'investigation'
};

class NaturalLanguageProcessor extends BaseNLPProcessor {
  constructor() {
    super();

    // Intent detection patterns
    this.intentPatterns = {
      [IntentType.FEATURE_REQUEST]: [
        /(?:add|create|build|implement|develop|design)\s+(?:a\s+)?(?:new\s+)?feature/i,
        /(?:need|want|would like)\s+(?:to\s+)?(?:add|create|build|implement)/i,
        /(?:need|want|would like)\s+.*?feature/i,
        /feature\s+(?:request|that|to)/i,
        /(?:add|implement)\s+(?:support for|the ability to)/i,
        /(?:can we|could we|should we)\s+(?:add|have|implement)/i,
        /(?:new|add|create)\s+.*?(?:feature|functionality|capability)/i
      ],
      [IntentType.BUG_REPORT]: [
        /(?:bug|issue|problem|error|broken|not working|fails?|crash(?:es|ed)?)/i,
        /(?:fix|resolve|repair)\s+(?:the\s+)?(?:bug|issue|problem)/i,
        /(?:something|it)\s+(?:is|was)\s+(?:broken|not working)/i,
        /(?:getting|receiving|seeing)\s+(?:an?\s+)?(?:error|exception)/i,
        /(?:doesn't|does not|isn't|is not)\s+work(?:ing)?/i
      ],
      [IntentType.ENHANCEMENT]: [
        /(?:improve|enhance|optimize|better|upgrade|refine)/i,
        /(?:make|improve)\s+(?:it\s+)?(?:better|faster|easier|simpler)/i,
        /enhancement\s+(?:to|of|for)/i,
        /(?:performance|speed|efficiency)\s+improvement/i
      ],
      [IntentType.REFACTOR]: [
        /refactor(?:ing)?/i,
        /(?:clean up|reorganize|restructure)\s+(?:the\s+)?code/i,
        /(?:technical debt|code quality)/i,
        /(?:improve|better)\s+code\s+(?:structure|organization)/i
      ],
      [IntentType.DOCUMENTATION]: [
        /(?:add|create|write|update)\s+(?:the\s+)?(?:documentation|docs|readme|guide)/i,
        /(?:document|explain|describe)\s+how\s+to/i,
        /(?:need|want)\s+(?:better\s+)?(?:documentation|docs)/i
      ],
      [IntentType.TESTING]: [
        /(?:add|create|write|implement)\s+(?:unit\s+)?tests?/i,
        /(?:test|testing)\s+(?:coverage|strategy)/i,
        /(?:need|want)\s+(?:more\s+)?tests?/i
      ],
      [IntentType.CONFIGURATION]: [
        /(?:configure|setup|config|settings|configuration)/i,
        /(?:change|update|modify)\s+(?:the\s+)?(?:config|settings|configuration)/i,
        /(?:environment|deployment)\s+(?:config|setup)/i
      ],
      [IntentType.DEPLOYMENT]: [
        /deploy(?:ment)?/i,
        /(?:release|ship|publish)\s+(?:to|on)/i,
        /(?:production|staging)\s+deployment/i
      ],
      [IntentType.INVESTIGATION]: [
        /(?:investigate|research|explore|analyze)/i,
        /(?:why|how)\s+(?:does|is|do)/i,
        /(?:need to\s+)?(?:understand|figure out|find out)/i
      ],
      [IntentType.QUESTION]: [
        /^(?:what|why|how|when|where|who|which)/i,
        /\?$/,
        /(?:can you|could you)\s+(?:explain|tell me)/i
      ]
    };

    // Conversation context
    this.conversationContext = {
      turns: [],
      extractedInfo: {},
      currentIntent: null,
      specInProgress: null
    };
  }

  /**
   * Detect intent from natural language text
   * Sprint 5.5: Intent classification
   */
  detectIntent(text) {
    const scores = {};

    // Score each intent type
    for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
      scores[intent] = 0;

      for (const pattern of patterns) {
        if (pattern.test(text)) {
          scores[intent] += 1;
        }
      }
    }

    // Find highest scoring intent
    const entries = Object.entries(scores);
    const maxScore = Math.max(...entries.map(([_, score]) => score));

    if (maxScore === 0) {
      return {
        intent: IntentType.UNKNOWN,
        confidence: 0,
        scores
      };
    }

    const topIntent = entries.find(([_, score]) => score === maxScore)[0];

    return {
      intent: topIntent,
      confidence: Math.min(maxScore / 3, 1.0), // Normalize to 0-1
      scores,
      specType: IntentToSpecType[topIntent] || 'task'
    };
  }

  /**
   * Process conversation turn and extract information
   * Sprint 5.5: Conversational spec building
   */
  processConversationTurn(text, context = {}) {
    const turn = {
      timestamp: new Date().toISOString(),
      text,
      ...context
    };

    // Detect intent
    const intent = this.detectIntent(text);
    turn.intent = intent;

    // Extract requirements
    const requirements = this.extractRequirements(text);
    turn.requirements = requirements;

    // Extract entities
    const entities = this.extractEntities(text);
    turn.entities = entities;

    // Extract constraints
    const constraints = this.extractConstraints(text);
    turn.constraints = constraints;

    // Add to conversation history
    this.conversationContext.turns.push(turn);

    // Update current intent if confidence is high
    if (intent.confidence > 0.5) {
      this.conversationContext.currentIntent = intent.intent;
    }

    // Merge extracted information
    this.mergeExtractedInfo(turn);

    return turn;
  }

  /**
   * Merge extracted information into conversation context
   */
  mergeExtractedInfo(turn) {
    const { requirements, entities, constraints } = turn;

    // Initialize if needed
    if (!this.conversationContext.extractedInfo.requirements) {
      this.conversationContext.extractedInfo.requirements = [];
    }
    if (!this.conversationContext.extractedInfo.entities) {
      this.conversationContext.extractedInfo.entities = {
        users: [],
        components: [],
        actions: [],
        data: []
      };
    }
    if (!this.conversationContext.extractedInfo.constraints) {
      this.conversationContext.extractedInfo.constraints = [];
    }

    // Merge requirements (avoid duplicates)
    requirements.forEach(req => {
      const exists = this.conversationContext.extractedInfo.requirements.some(
        r => r.text.toLowerCase() === req.text.toLowerCase()
      );
      if (!exists) {
        this.conversationContext.extractedInfo.requirements.push(req);
      }
    });

    // Merge entities
    for (const [type, values] of Object.entries(entities)) {
      if (values.length > 0) {
        this.conversationContext.extractedInfo.entities[type] = [
          ...new Set([
            ...this.conversationContext.extractedInfo.entities[type],
            ...values
          ])
        ];
      }
    }

    // Merge constraints (avoid duplicates)
    constraints.forEach(constraint => {
      const exists = this.conversationContext.extractedInfo.constraints.some(
        c => c.context === constraint.context
      );
      if (!exists) {
        this.conversationContext.extractedInfo.constraints.push(constraint);
      }
    });
  }

  /**
   * Generate structured spec from conversation
   * Sprint 5.5: Spec generation
   */
  generateSpecFromConversation() {
    const { extractedInfo, currentIntent, turns } = this.conversationContext;

    if (turns.length === 0) {
      throw new Error('No conversation turns to generate spec from');
    }

    // Determine spec type
    const firstIntent = turns[0].intent;
    const specType = firstIntent.specType || 'task';

    // Generate title from first turn
    const title = this.generateTitle(turns[0].text, specType);

    // Aggregate all text for description
    const description = turns.map(t => t.text).join('\n\n');

    // Create spec structure
    const spec = {
      title,
      type: specType,
      description,
      requirements: extractedInfo.requirements || [],
      entities: extractedInfo.entities || {},
      constraints: extractedInfo.constraints || [],
      acceptance: this.generateAcceptanceCriteria(extractedInfo),
      metadata: {
        source: 'conversation',
        intent: currentIntent,
        conversationTurns: turns.length,
        confidence: this.calculateOverallConfidence(),
        generatedAt: new Date().toISOString()
      }
    };

    return spec;
  }

  /**
   * Generate title from text
   */
  generateTitle(text, specType) {
    // Remove question marks
    let title = text.replace(/\?/g, '').trim();

    // Limit length
    if (title.length > 80) {
      title = title.substring(0, 77) + '...';
    }

    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);

    // Add spec type prefix if not already present
    const typeKeywords = {
      feature: ['add', 'create', 'build', 'implement', 'feature'],
      bug: ['fix', 'bug', 'issue', 'error', 'broken'],
      enhancement: ['improve', 'enhance', 'optimize', 'better'],
      refactor: ['refactor', 'clean', 'reorganize']
    };

    const hasTypeKeyword = typeKeywords[specType]?.some(keyword =>
      title.toLowerCase().includes(keyword)
    );

    if (!hasTypeKeyword && specType !== 'task') {
      const prefixes = {
        feature: 'Add',
        bug: 'Fix',
        enhancement: 'Improve',
        refactor: 'Refactor',
        docs: 'Document',
        test: 'Test'
      };
      const prefix = prefixes[specType];
      if (prefix && !title.startsWith(prefix)) {
        title = `${prefix}: ${title}`;
      }
    }

    return title;
  }

  /**
   * Generate acceptance criteria from extracted information
   */
  generateAcceptanceCriteria(extractedInfo) {
    const criteria = [];

    // From requirements
    extractedInfo.requirements?.forEach(req => {
      if (req.priority === 'required') {
        criteria.push(`✓ ${req.text}`);
      }
    });

    // From constraints
    extractedInfo.constraints?.forEach(constraint => {
      criteria.push(`✓ Meets ${constraint.type} constraint: ${constraint.context}`);
    });

    // If no criteria generated, add default
    if (criteria.length === 0) {
      criteria.push('✓ Implementation meets specified requirements');
      criteria.push('✓ All tests pass');
      criteria.push('✓ Documentation is updated');
    }

    return criteria;
  }

  /**
   * Calculate overall confidence score
   */
  calculateOverallConfidence() {
    const { turns } = this.conversationContext;
    if (turns.length === 0) return 0;

    const avgIntentConfidence = turns.reduce((sum, t) =>
      sum + (t.intent.confidence || 0), 0
    ) / turns.length;

    const hasRequirements = this.conversationContext.extractedInfo.requirements?.length > 0;
    const hasEntities = Object.values(this.conversationContext.extractedInfo.entities || {})
      .some(arr => arr.length > 0);

    let confidence = avgIntentConfidence * 0.6; // 60% weight on intent

    if (hasRequirements) confidence += 0.2;
    if (hasEntities) confidence += 0.2;

    return Math.min(confidence, 1.0);
  }

  /**
   * Reset conversation context
   */
  resetConversation() {
    this.conversationContext = {
      turns: [],
      extractedInfo: {},
      currentIntent: null,
      specInProgress: null
    };
  }

  /**
   * Get conversation summary
   */
  getConversationSummary() {
    const { turns, extractedInfo, currentIntent } = this.conversationContext;

    return {
      turnCount: turns.length,
      currentIntent,
      requirementsCount: extractedInfo.requirements?.length || 0,
      entitiesCount: Object.values(extractedInfo.entities || {})
        .reduce((sum, arr) => sum + arr.length, 0),
      constraintsCount: extractedInfo.constraints?.length || 0,
      confidence: this.calculateOverallConfidence(),
      canGenerateSpec: turns.length > 0
    };
  }

  /**
   * Check if conversation has enough information for spec
   */
  isReadyForSpec() {
    const summary = this.getConversationSummary();
    return summary.confidence >= 0.5 && summary.requirementsCount > 0;
  }

  /**
   * Get missing information prompts
   * Sprint 5.5: Conversational guidance
   */
  getMissingInformationPrompts() {
    const { extractedInfo, currentIntent } = this.conversationContext;
    const prompts = [];

    // No requirements
    if (!extractedInfo.requirements || extractedInfo.requirements.length === 0) {
      prompts.push({
        type: 'requirements',
        question: 'What specific requirements or features are needed?',
        priority: 'high'
      });
    }

    // No acceptance criteria elements
    const hasConstraints = extractedInfo.constraints?.length > 0;
    if (!hasConstraints && currentIntent !== IntentType.QUESTION) {
      prompts.push({
        type: 'constraints',
        question: 'Are there any specific constraints (time, performance, size)?',
        priority: 'medium'
      });
    }

    // No user entities (for feature requests)
    const hasUsers = extractedInfo.entities?.users?.length > 0;
    if (!hasUsers && currentIntent === IntentType.FEATURE_REQUEST) {
      prompts.push({
        type: 'users',
        question: 'Who are the users or target audience for this feature?',
        priority: 'medium'
      });
    }

    // Unclear intent
    const summary = this.getConversationSummary();
    if (summary.confidence < 0.5) {
      prompts.push({
        type: 'clarification',
        question: 'Could you provide more details about what you want to accomplish?',
        priority: 'high'
      });
    }

    return prompts;
  }

  /**
   * Suggest follow-up questions based on context
   * Sprint 5.5: Conversational flow
   */
  suggestFollowUpQuestions() {
    const { currentIntent, extractedInfo, turns } = this.conversationContext;

    const suggestions = [];

    // Intent-specific questions
    if (currentIntent === IntentType.FEATURE_REQUEST) {
      if (!extractedInfo.constraints?.length) {
        suggestions.push('What performance or scalability requirements should be considered?');
      }
      if (!extractedInfo.entities?.users?.length) {
        suggestions.push('Who will use this feature?');
      }
    } else if (currentIntent === IntentType.BUG_REPORT) {
      suggestions.push('What are the steps to reproduce the issue?');
      suggestions.push('What is the expected behavior?');
      suggestions.push('What is the actual behavior?');
    } else if (currentIntent === IntentType.ENHANCEMENT) {
      suggestions.push('What metrics should be improved?');
      suggestions.push('Are there specific scenarios to optimize for?');
    }

    // If very short conversation, suggest elaboration
    if (turns.length === 1) {
      suggestions.unshift('Could you provide more details or context?');
    }

    return suggestions.slice(0, 3); // Return top 3
  }
}

// Export class and constants
module.exports = NaturalLanguageProcessor;
module.exports.IntentType = IntentType;
module.exports.IntentToSpecType = IntentToSpecType;
