/**
 * Domain-to-Model Optimal Assignments
 * Sprint 2.17: Research-backed model assignments for each domain
 *
 * Research Date: October 2025
 * Priority: Free Tier → OpenRouter → Local → Paid Premium
 *
 * Based on comprehensive benchmarks:
 * - SWE-Bench Verified (real-world software coding)
 * - AIME 2025 (advanced mathematics)
 * - LiveCodeBench (coding performance)
 * - WebDev Arena (web development)
 * - Cost per 1M tokens
 */

/**
 * Model capability tiers
 */
const ModelTier = {
  FREE: 'free',           // Gemini 2.5 Pro, Gemini 2.0 Flash
  OPENROUTER: 'openrouter', // DeepSeek R1, Qwen 3 Max, Kimi K2
  LOCAL: 'local',         // Docker-based user models
  PAID_ECONOMY: 'paid_economy', // o4-mini, Haiku 4
  PAID_PREMIUM: 'paid_premium'  // GPT-5, Sonnet 4.5, Opus 4.1
};

/**
 * Free Tier Model Specifications (Google Gemini)
 * NO COST - Perfect for development and terminal mode
 */
const FreeTierModels = {
  'gemini-2.5-pro': {
    tier: ModelTier.FREE,
    provider: 'google',
    cost: { input: 0, output: 0 }, // FREE with limits
    limits: {
      requestsPerMinute: 5,
      tokensPerMinute: 250000,
      requestsPerDay: 100
    },
    strengths: [
      'Complex reasoning',
      'Thinking mode',
      'Visual tasks',
      'Documentation',
      'UI/UX design',
      'Web development'
    ],
    benchmarks: {
      'SWE-Bench Verified': '63.8%',
      'WebDev Arena ELO': '1415 (leading)',
      'Context': '1M tokens'
    },
    bestFor: [
      'documentation',
      'design',
      'ui',
      'ux',
      'research',
      'general',
      'planning'
    ],
    commercialUse: true
  },

  'gemini-2.0-flash': {
    tier: ModelTier.FREE,
    provider: 'google',
    cost: { input: 0, output: 0 }, // FREE with generous limits
    limits: {
      requestsPerMinute: 15,
      tokensPerMinute: 1000000, // 1M TPM!
      requestsPerDay: 1500
    },
    strengths: [
      'High throughput',
      'Low latency',
      'Efficiency (20-30% less tokens)',
      'Classification',
      'Summarization',
      'Data extraction'
    ],
    benchmarks: {
      'Efficiency': '20-30% less tokens than 2.5 Pro',
      'Context': '1M tokens',
      'Speed': 'Fastest in class'
    },
    bestFor: [
      'classification',
      'summarization',
      'extraction',
      'communication',
      'simple-coding',
      'testing',
      'high-volume'
    ],
    commercialUse: true
  }
};

/**
 * OpenRouter Models (Cost-effective paid options)
 * AFFORDABLE - Excellent value for money
 */
const OpenRouterModels = {
  'deepseek/deepseek-r1': {
    tier: ModelTier.OPENROUTER,
    provider: 'openrouter',
    cost: { input: 0.55, output: 2.19 }, // Very affordable
    strengths: [
      'Advanced reasoning',
      'Mathematical problem-solving',
      'Debugging',
      'Security analysis',
      'Code review',
      'Complex logic'
    ],
    benchmarks: {
      'AIME 2025': '79.8% (71.0% pass@1)',
      'MATH-500': '97.3%',
      'Codeforces ELO': '2029 (expert level)',
      'Context': '131K tokens'
    },
    bestFor: [
      'reasoning',
      'analysis',
      'security',
      'architecture',
      'debugging',
      'optimization',
      'math'
    ]
  },

  'qwen/qwen3-max': {
    tier: ModelTier.OPENROUTER,
    provider: 'openrouter',
    cost: { input: 1.20, output: 6.00 }, // Moderate cost
    strengths: [
      'Multilingual (119 languages)',
      'Large context (262K)',
      'Backend development',
      'Code translation',
      'API development',
      'Large codebase work'
    ],
    benchmarks: {
      'SWE-Bench Verified': '69.6%',
      'LMArena': 'Top 3 globally',
      'Context': '262K tokens',
      'Languages': '119 supported'
    },
    bestFor: [
      'backend',
      'api',
      'multilingual',
      'infrastructure',
      'large-codebase',
      'database',
      'services'
    ]
  },

  'moonshotai/kimi-k2': {
    tier: ModelTier.OPENROUTER,
    provider: 'openrouter',
    cost: { input: 0.15, output: 2.50 }, // CHEAPEST paid option
    strengths: [
      'Cost-effective coding',
      'Frontend development',
      'Agentic tasks',
      'Testing',
      'Automation',
      'General coding'
    ],
    benchmarks: {
      'LiveCodeBench': '53.7% (beats GPT-4.1 44.7%)',
      'SWE-Bench Verified': '65.8%',
      'MATH-500': '97.4%',
      'Context': '128K tokens'
    },
    bestFor: [
      'frontend',
      'testing',
      'automation',
      'simple-coding',
      'scripts',
      'workflows',
      'cost-effective'
    ]
  }
};

/**
 * Paid Premium Models (High-value tasks only)
 * EXPENSIVE - Use when quality is critical
 */
const PaidPremiumModels = {
  'gpt-5': {
    tier: ModelTier.PAID_PREMIUM,
    provider: 'openai',
    cost: { input: 1.25, output: 10.00 }, // Expensive
    strengths: [
      'Complex coding',
      'Advanced reasoning',
      'Long context (400K)',
      'High accuracy',
      'Mission-critical tasks'
    ],
    benchmarks: {
      'AIME 2025': '94.6% (HIGHEST)',
      'SWE-Bench Verified': '74.9%',
      'GPQA Diamond': '87.3%',
      'Context': '400K tokens'
    },
    bestFor: [
      'critical-coding',
      'complex-refactoring',
      'mission-critical',
      'long-context',
      'high-stakes'
    ]
  },

  'o4-mini': {
    tier: ModelTier.PAID_ECONOMY,
    provider: 'openai',
    cost: { input: 0.60, output: 2.40 }, // Mid-range
    strengths: [
      'Fast reasoning',
      'Quick analysis',
      'Efficient',
      'Good cost/performance'
    ],
    benchmarks: {
      'Context': '200K tokens',
      'Performance': 'Near GPT-5 at lower cost'
    },
    bestFor: [
      'quick-analysis',
      'fast-debugging',
      'medium-complexity'
    ]
  },

  'claude-sonnet-4-5-20250929': {
    tier: ModelTier.PAID_PREMIUM,
    provider: 'anthropic',
    cost: { input: 3.00, output: 15.00 }, // Very expensive
    strengths: [
      'Best coding model in world',
      'Complex agents',
      'Computer use',
      'Multi-file refactoring'
    ],
    benchmarks: {
      'SWE-Bench Verified': '77.2% (82% parallel) - HIGHEST',
      'OSWorld': '61.4%',
      'Context': '200K tokens'
    },
    bestFor: [
      'complex-agents',
      'multi-file-refactoring',
      'computer-use',
      'advanced-architecture'
    ]
  },

  'claude-opus-4-1': {
    tier: ModelTier.PAID_PREMIUM,
    provider: 'anthropic',
    cost: { input: 15.00, output: 75.00 }, // MOST EXPENSIVE
    strengths: [
      'Deep research',
      'Complex planning',
      'Multi-step reasoning',
      'Strategic analysis'
    ],
    benchmarks: {
      'SWE-Bench Verified': '74.5%',
      'Use case': 'Research-grade prompts'
    },
    bestFor: [
      'research',
      'strategic-planning',
      'complex-analysis',
      'deep-investigation'
    ]
  },

  'claude-haiku-4': {
    tier: ModelTier.PAID_ECONOMY,
    provider: 'anthropic',
    cost: { input: 0.80, output: 4.00 }, // Affordable paid
    strengths: [
      'Fast coding',
      'Cost-effective',
      'Quick fixes',
      'Simple tasks'
    ],
    benchmarks: {
      'SWE-Bench Verified': '40.6%',
      'Speed': 'Very fast'
    },
    bestFor: [
      'simple-coding',
      'quick-fixes',
      'fast-tasks'
    ]
  }
};

/**
 * Domain-to-Model Assignment Strategy
 *
 * Each domain has a prioritized list:
 * 1. Primary (free tier if possible)
 * 2. Secondary (OpenRouter)
 * 3. Tertiary (paid premium for complex cases)
 */
const DomainAssignments = {
  // DESIGN & UI/UX DOMAINS
  'design': {
    primary: 'gemini-2.5-pro', // FREE - excellent for design
    secondary: 'gemini-2.0-flash', // FREE - fast prototyping
    tertiary: 'claude-sonnet-4-5-20250929', // Paid - complex design systems
    reasoning: 'Visual tasks, prototyping, design systems'
  },

  'ui': {
    primary: 'gemini-2.5-pro', // FREE - WebDev Arena leader
    secondary: 'moonshotai/kimi-k2', // OpenRouter - cost-effective
    tertiary: 'claude-sonnet-4-5-20250929', // Paid - complex components
    reasoning: 'UI components, styling, layouts'
  },

  'ux': {
    primary: 'gemini-2.5-pro', // FREE - thinking mode for UX reasoning
    secondary: 'gemini-2.0-flash', // FREE - fast user flow analysis
    tertiary: 'claude-opus-4-1', // Paid - deep UX research
    reasoning: 'User experience, workflows, usability'
  },

  // DOCUMENTATION & COMMUNICATION
  'documentation': {
    primary: 'gemini-2.0-flash', // FREE - high throughput
    secondary: 'gemini-2.5-pro', // FREE - complex docs
    tertiary: 'gpt-5', // Paid - critical documentation
    reasoning: 'Docs, guides, API documentation'
  },

  'communication': {
    primary: 'gemini-2.0-flash', // FREE - fast, efficient
    secondary: 'gemini-2.5-pro', // FREE - complex communication
    tertiary: null, // Usually free tier sufficient
    reasoning: 'Messages, reports, summaries'
  },

  // REASONING & ANALYSIS DOMAINS
  'reasoning': {
    primary: 'deepseek/deepseek-r1', // OpenRouter - reasoning specialist
    secondary: 'gemini-2.5-pro', // FREE - thinking mode
    tertiary: 'claude-opus-4-1', // Paid - deep reasoning
    reasoning: 'Logic, analysis, complex reasoning (R1: 79.8% AIME)'
  },

  'analysis': {
    primary: 'deepseek/deepseek-r1', // OpenRouter - excellent for analysis
    secondary: 'gemini-2.5-pro', // FREE - good analytical capabilities
    tertiary: 'claude-opus-4-1', // Paid - deep analysis
    reasoning: 'Data analysis, pattern recognition'
  },

  'debugging': {
    primary: 'deepseek/deepseek-r1', // OpenRouter - 2029 Codeforces ELO
    secondary: 'o4-mini', // Paid economy - fast debugging
    tertiary: 'claude-sonnet-4-5-20250929', // Paid - complex bugs
    reasoning: 'Bug fixing, troubleshooting, root cause'
  },

  'security': {
    primary: 'deepseek/deepseek-r1', // OpenRouter - excellent for security
    secondary: 'gemini-2.5-pro', // FREE - security analysis
    tertiary: 'claude-opus-4-1', // Paid - deep security audit
    reasoning: 'Security audits, vulnerability analysis'
  },

  'architecture': {
    primary: 'deepseek/deepseek-r1', // OpenRouter - system design
    secondary: 'claude-sonnet-4-5-20250929', // Paid - complex architecture
    tertiary: 'claude-opus-4-1', // Paid - strategic architecture
    reasoning: 'System design, patterns, architecture'
  },

  'optimization': {
    primary: 'deepseek/deepseek-r1', // OpenRouter - performance analysis
    secondary: 'gemini-2.5-pro', // FREE - optimization analysis
    tertiary: 'gpt-5', // Paid - critical optimization
    reasoning: 'Performance, efficiency, optimization'
  },

  // CODING DOMAINS
  'coding': {
    primary: 'moonshotai/kimi-k2', // OpenRouter - cheapest, good coding
    secondary: 'gemini-2.0-flash', // FREE - simple coding
    tertiary: 'claude-sonnet-4-5-20250929', // Paid - complex coding
    reasoning: 'General coding (K2: 53.7% LiveCodeBench)'
  },

  'frontend': {
    primary: 'moonshotai/kimi-k2', // OpenRouter - cost-effective frontend
    secondary: 'gemini-2.5-pro', // FREE - WebDev Arena leader
    tertiary: 'claude-sonnet-4-5-20250929', // Paid - complex components
    reasoning: 'React, Vue, UI components'
  },

  'backend': {
    primary: 'qwen/qwen3-max', // OpenRouter - backend specialist
    secondary: 'moonshotai/kimi-k2', // OpenRouter - cost-effective
    tertiary: 'claude-sonnet-4-5-20250929', // Paid - complex backend
    reasoning: 'API, database, services (Qwen: 69.6% SWE-Bench)'
  },

  'api': {
    primary: 'qwen/qwen3-max', // OpenRouter - API specialist
    secondary: 'moonshotai/kimi-k2', // OpenRouter - cost-effective
    tertiary: 'claude-sonnet-4-5-20250929', // Paid - complex APIs
    reasoning: 'API design, endpoints, integration'
  },

  'database': {
    primary: 'qwen/qwen3-max', // OpenRouter - data handling
    secondary: 'gemini-2.0-flash', // FREE - simple queries
    tertiary: 'claude-sonnet-4-5-20250929', // Paid - complex schemas
    reasoning: 'SQL, NoSQL, data modeling'
  },

  'infrastructure': {
    primary: 'qwen/qwen3-max', // OpenRouter - DevOps
    secondary: 'moonshotai/kimi-k2', // OpenRouter - automation
    tertiary: 'gpt-5', // Paid - critical infrastructure
    reasoning: 'DevOps, deployment, CI/CD'
  },

  'testing': {
    primary: 'moonshotai/kimi-k2', // OpenRouter - test generation
    secondary: 'gemini-2.0-flash', // FREE - high volume tests
    tertiary: 'claude-haiku-4', // Paid economy - fast testing
    reasoning: 'Unit tests, integration, E2E'
  },

  'automation': {
    primary: 'moonshotai/kimi-k2', // OpenRouter - automation scripts
    secondary: 'gemini-2.0-flash', // FREE - simple automation
    tertiary: 'claude-haiku-4', // Paid economy - quick automation
    reasoning: 'Scripts, workflows, automation'
  },

  // SPECIAL DOMAINS
  'research': {
    primary: 'gemini-2.5-pro', // FREE - thinking mode
    secondary: 'deepseek/deepseek-r1', // OpenRouter - deep analysis
    tertiary: 'claude-opus-4-1', // Paid - research-grade
    reasoning: 'Investigation, discovery, research'
  },

  'multilingual': {
    primary: 'qwen/qwen3-max', // OpenRouter - 119 languages
    secondary: 'gemini-2.5-pro', // FREE - multilingual support
    tertiary: 'gpt-5', // Paid - complex multilingual
    reasoning: 'Translation, international apps (Qwen: 119 languages)'
  },

  'large-codebase': {
    primary: 'qwen/qwen3-max', // OpenRouter - 262K context
    secondary: 'gpt-5', // Paid - 400K context
    tertiary: 'gemini-2.5-pro', // FREE - 1M context
    reasoning: 'Large projects, refactoring (Qwen: 262K, GPT-5: 400K)'
  },

  'complex-agents': {
    primary: 'claude-sonnet-4-5-20250929', // Paid - best for agents
    secondary: 'moonshotai/kimi-k2', // OpenRouter - agentic tasks
    tertiary: 'gpt-5', // Paid - complex agents
    reasoning: 'Multi-agent systems, computer use (Sonnet: 77.2% SWE-Bench)'
  },

  'critical': {
    primary: 'gpt-5', // Paid - highest accuracy (94.6% AIME)
    secondary: 'claude-sonnet-4-5-20250929', // Paid - mission critical
    tertiary: 'claude-opus-4-1', // Paid - deep validation
    reasoning: 'Mission-critical tasks requiring highest accuracy'
  },

  // DEFAULT/GENERAL
  'general': {
    primary: 'gemini-2.0-flash', // FREE - fast, efficient
    secondary: 'gemini-2.5-pro', // FREE - more complex
    tertiary: 'moonshotai/kimi-k2', // OpenRouter - if free tier exhausted
    reasoning: 'General tasks, unknown domain'
  }
};

/**
 * Terminal mode configuration
 * ALWAYS prioritize free tier in terminal/development mode
 */
const TerminalModeStrategy = {
  defaultPrimary: 'gemini-2.0-flash', // Highest free tier quotas
  defaultSecondary: 'gemini-2.5-pro', // Better quality when needed
  fallbackToOpenRouter: true, // Use OpenRouter if free tier exhausted
  neverUsePremium: false, // Can use premium if explicitly requested
  priorityOrder: [
    ModelTier.FREE,
    ModelTier.OPENROUTER,
    ModelTier.LOCAL,
    ModelTier.PAID_ECONOMY,
    ModelTier.PAID_PREMIUM
  ]
};

module.exports = {
  ModelTier,
  FreeTierModels,
  OpenRouterModels,
  PaidPremiumModels,
  DomainAssignments,
  TerminalModeStrategy
};
