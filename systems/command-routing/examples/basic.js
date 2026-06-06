/**
 * Command Routing - Command Router Example
 * Part of the Agent Primitives
 */

const { CommandRouter, Intent } = require('../index');

// Create router instance
const router = new CommandRouter({
  enableAnalytics: true,
  timeout: 5000,
  maxRetries: 2
});

// Add custom middleware for logging
router.use(async (context) => {
  console.log(` Processing command: ${context.analysis.fullCommand}`);
  console.log(` Intent: ${context.analysis.intent}, Confidence: ${(context.analysis.confidence * 100).toFixed(1)}%`);
});

// Register custom handlers
router.registerHandler('build', async (analysis, context) => {
  console.log(` Building: ${analysis.args.join(' ')}`);

  // Simulate build process
  await new Promise(resolve => setTimeout(resolve, 1000));

  return {
    action: 'build',
    target: analysis.args[0] || 'project',
    status: 'completed',
    files: ['dist/bundle.js', 'dist/styles.css'],
    buildTime: '1.2s'
  };
});

router.registerHandler('analyze', async (analysis, context) => {
  console.log(` Analyzing: ${analysis.args.join(' ')}`);

  // Simulate analysis
  await new Promise(resolve => setTimeout(resolve, 800));

  return {
    action: 'analyze',
    target: analysis.args.join(' '),
    status: 'completed',
    insights: [
      'Code quality: 85%',
      'Test coverage: 78%',
      'Performance score: 92%'
    ],
    recommendations: ['Add more unit tests', 'Optimize image loading']
  };
});

router.registerHandler('deploy', async (analysis, context) => {
  console.log(` Deploying: ${analysis.args.join(' ')}`);

  // Simulate deployment
  await new Promise(resolve => setTimeout(resolve, 1500));

  return {
    action: 'deploy',
    environment: analysis.args[0] || 'production',
    status: 'deployed',
    url: `https://${analysis.args[0] || 'app'}.example.com`,
    deploymentId: `deploy-${Date.now()}`
  };
});

// Listen for router events
router.on('command:received', (data) => {
  console.log(` Command received: ${data.analysis.fullCommand}`);
});

router.on('command:completed', (data) => {
  console.log(` Command completed in ${data.duration}ms`);
  console.log(` Result:`, JSON.stringify(data.result, null, 2));
});

router.on('command:error', (data) => {
  console.log(` Command failed: ${data.error}`);
});

async function demo() {
  console.log(' Command Routing Command Router Demo\n');

  // Demo commands
  const commands = [
    ['build', ['react', 'app']],
    ['analyze', ['codebase', 'performance']],
    ['deploy', ['staging']],
    ['test', ['unit', 'tests']],
    ['unknown', ['command']]
  ];

  for (const [command, args] of commands) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Executing: ${command} ${args.join(' ')}`);
    console.log(`${'='.repeat(50)}`);

    const result = await router.route(command, args, {
      userId: 'demo-user',
      timestamp: new Date().toISOString()
    });

    if (result.success) {
      console.log(' Success');
    } else {
      console.log(' Failed:', result.error);
    }

    // Small delay between commands
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Show final statistics
  console.log('\n Command Routing Router Statistics:');
  console.log(JSON.stringify(router.getStats(), null, 2));

  // Show registered handlers
  console.log('\n  Command Routing Registered Handlers:');
  router.listHandlers().forEach(handler => {
    console.log(`- ${handler.intent}: Priority ${handler.priority}, Timeout ${handler.timeout}ms`);
  });
}

// Advanced usage example
async function advancedDemo() {
  console.log('\n Advanced Command Routing Router Features\n');

  // Create router with custom configuration
  const advancedRouter = new CommandRouter({
    enableAnalytics: true,
    defaultHandler: 'custom-fallback',
    timeout: 10000
  });

  // Add authentication middleware
  advancedRouter.use(async (context) => {
    if (!context.userId) {
      throw new Error('Authentication required');
    }
    console.log(` User authenticated: ${context.userId || 'guest'}`);
  });

  // Add rate limiting middleware
  const rateLimiter = new Map();
  advancedRouter.use(async (context) => {
    const userId = context.userId;
    const now = Date.now();
    const userRequests = rateLimiter.get(userId) || [];

    // Clean old requests (older than 1 minute)
    const recentRequests = userRequests.filter(time => now - time < 60000);

    if (recentRequests.length >= 10) {
      throw new Error('Rate limit exceeded: max 10 requests per minute');
    }

    recentRequests.push(now);
    rateLimiter.set(userId, recentRequests);

    console.log(` Rate limit: ${recentRequests.length}/10 requests`);
  });

  // Custom fallback handler
  advancedRouter.registerHandler('custom-fallback', async (analysis, context) => {
    return {
      action: 'fallback',
      message: `Custom handler for unrecognized command: ${analysis.fullCommand}`,
      suggestions: ['build', 'analyze', 'deploy'],
      confidence: analysis.confidence
    };
  });

  // Test advanced features
  try {
    const result = await advancedRouter.route('unknown-command', ['with', 'args'], {
      userId: 'advanced-user'
    });
    console.log('Advanced result:', JSON.stringify(result.result, null, 2));
  } catch (error) {
    console.log('Advanced error:', error.message);
  }
}

// Run demos
demo()
  .then(() => advancedDemo())
  .then(() => {
    console.log('\n Command Routing Demo completed!');
    process.exit(0);
  })
  .catch(console.error);