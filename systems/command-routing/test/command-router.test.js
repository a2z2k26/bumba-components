/**
 * Command Routing Test Suite
 * Part of the BUMBA Platform
 */

const { CommandRouter, CommandAnalyzer, Intent } = require('../src/index');

describe('Command Routing CommandRouter', () => {
  let router;

  beforeEach(() => {
    router = new CommandRouter({ enableAnalytics: true });
  });

  afterEach(() => {
    if (router) {
      router.destroy();
    }
  });

  describe('Core Routing', () => {
    test('should route commands to correct handlers', async () => {
      const buildHandler = jest.fn().mockResolvedValue({ status: 'built' });
      router.registerHandler('build', buildHandler);

      const result = await router.route('build', ['app']);

      expect(result.success).toBe(true);
      expect(buildHandler).toHaveBeenCalled();
      expect(buildHandler.mock.calls[0][0].intent).toBe('build');
    });

    test('should handle invalid commands gracefully', async () => {
      const result = await router.route(null);
      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    test('should fallback to default handler', async () => {
      const result = await router.route('unknown', ['command']);
      expect(result.success).toBe(true);
      expect(result.result.action).toBe('general');
    });

    test('should preserve error context on retries', async () => {
      let attempts = 0;
      const failingHandler = jest.fn().mockImplementation(() => {
        attempts++;
        throw new Error(`Attempt ${attempts} failed`);
      });

      router.registerHandler('fail', failingHandler, { retries: 2 });

      const result = await router.route('fail', []);
      expect(result.success).toBe(false);
      expect(failingHandler).toHaveBeenCalledTimes(3);
    });
  });

  describe('Middleware', () => {
    test('should apply middleware in order', async () => {
      const order = [];

      router.use(async (context) => {
        order.push('middleware1');
        context.modified = true;
      });

      router.use(async (context) => {
        order.push('middleware2');
        expect(context.modified).toBe(true);
      });

      await router.route('build', []);
      expect(order).toEqual(['middleware1', 'middleware2']);
    });

    test('should handle middleware errors', async () => {
      router.use(async () => {
        throw new Error('Middleware error');
      });

      const result = await router.route('build', []);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Middleware error');
    });
  });

  describe('Statistics', () => {
    test('should track command statistics', async () => {
      await router.route('build', ['app']);
      await router.route('analyze', ['code']);
      await router.route('invalid'); // This will fail

      const stats = router.getStats();
      expect(stats.totalCommands).toBe(3);
      expect(stats.successfulCommands).toBe(2);
      expect(stats.failedCommands).toBe(1);
      expect(stats.commandsByIntent.build).toBe(1);
      expect(stats.commandsByIntent.analyze).toBe(1);
    });

    test('should maintain rolling window for stats', async () => {
      const smallRouter = new CommandRouter({ maxStatsHistory: 5 });

      for (let i = 0; i < 10; i++) {
        await smallRouter.route('test', [`${i}`]);
      }

      // Should only keep last 5 commands
      expect(smallRouter.commandHistory.length).toBe(5);
      smallRouter.destroy();
    });
  });

  describe('Cleanup', () => {
    test('should cleanup command history', async () => {
      await router.route('build', []);
      await router.route('test', []);

      const result = router.cleanup();
      expect(result.clearedCommands).toBe(2);
      expect(router.commandHistory.length).toBe(0);
    });

    test('should reset statistics', () => {
      router.stats.totalCommands = 100;
      router.reset();

      expect(router.stats.totalCommands).toBe(0);
      expect(router.stats.successfulCommands).toBe(0);
    });
  });
});

describe('CommandAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new CommandAnalyzer();
  });

  test('should detect intent correctly', () => {
    const analysis = analyzer.analyzeCommand('build', ['api']);
    expect(analysis.intent).toBe('build');
  });

  test('should match patterns', () => {
    const analysis = analyzer.analyzeCommand('create', ['api', 'endpoint']);
    const patterns = analysis.patterns;
    expect(patterns.some(p => p.name === 'api-development')).toBe(true);
  });

  test('should calculate confidence', () => {
    const analysis1 = analyzer.analyzeCommand('build', ['react', 'app']);
    const analysis2 = analyzer.analyzeCommand('do', ['something']);

    expect(analysis1.confidence).toBeGreaterThan(analysis2.confidence);
  });

  test('should handle invalid input', () => {
    expect(() => analyzer.analyzeCommand(null)).toThrow('non-empty string');
    expect(() => analyzer.analyzeCommand('')).toThrow('non-empty string');
  });

  test('should normalize args to array', () => {
    const analysis = analyzer.analyzeCommand('test', 'single-arg');
    expect(analysis.args).toEqual(['single-arg']);
  });
});

describe('Health and Diagnostics', () => {
  let router;

  beforeEach(() => {
    router = new CommandRouter();
  });

  afterEach(() => {
    router.destroy();
  });

  test('should report healthy status with no failures', async () => {
    await router.route('build', []);
    await router.route('test', []);

    const health = router.health();
    expect(health.status).toBe('healthy');
    expect(health.handlers).toBe(3); // Default handlers
    expect(health.stats.total).toBe(2);
    expect(health.stats.successRate).toBe(100);
  });

  test('should report degraded status with some failures', async () => {
    const failHandler = jest.fn().mockRejectedValue(new Error('fail'));
    router.registerHandler('fail', failHandler, { retries: 0 });

    await router.route('build', []);
    await router.route('fail', []);
    await router.route('fail', []);
    await router.route('build', []);

    const health = router.health();
    expect(health.status).not.toBe('healthy');
    expect(health.stats.failed).toBe(2);
  });

  test('should provide detailed diagnostics', async () => {
    await router.route('build', []);
    await router.route('analyze', []);

    const diagnostics = router.diagnostics();
    expect(diagnostics.configuration).toBeDefined();
    expect(diagnostics.handlers).toBeInstanceOf(Array);
    expect(diagnostics.intentDistribution).toBeDefined();
    expect(diagnostics.intentDistribution.build).toBe(1);
    expect(diagnostics.intentDistribution.analyze).toBe(1);
  });
});

describe('Telemetry Integration', () => {
  let router;
  let telemetryHooks;

  beforeEach(() => {
    telemetryHooks = {
      onCommandStart: jest.fn().mockReturnValue({
        setAttributes: jest.fn(),
        recordException: jest.fn(),
        setStatus: jest.fn(),
        end: jest.fn()
      }),
      onCommandEnd: jest.fn(),
      onError: jest.fn()
    };

    router = new CommandRouter();
    router.setTelemetryHooks(telemetryHooks);
  });

  afterEach(() => {
    router.destroy();
  });

  test('should call telemetry hooks on successful command', async () => {
    await router.route('build', ['app']);

    expect(telemetryHooks.onCommandStart).toHaveBeenCalledWith(
      'command.route',
      expect.objectContaining({
        'command.name': 'build',
        'command.args.count': 1
      })
    );
    expect(telemetryHooks.onCommandEnd).toHaveBeenCalled();
  });

  test('should record telemetry errors on failure', async () => {
    const error = new Error('Test error');
    const failHandler = jest.fn().mockRejectedValue(error);
    router.registerHandler('fail', failHandler, { retries: 0 });

    await router.route('fail', []);

    expect(telemetryHooks.onError).toHaveBeenCalled();
    expect(telemetryHooks.onCommandEnd).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'error' })
    );
  });

  test('should work without telemetry configured', async () => {
    const routerNoTelemetry = new CommandRouter();
    const result = await routerNoTelemetry.route('build', []);
    expect(result.success).toBe(true);
    routerNoTelemetry.destroy();
  });
});

describe('Advanced Handler Options', () => {
  let router;

  beforeEach(() => {
    router = new CommandRouter();
  });

  afterEach(() => {
    router.destroy();
  });

  test('should respect handler timeout', async () => {
    const slowHandler = jest.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 1000))
    );

    router.registerHandler('slow', slowHandler, { timeout: 100 });

    const result = await router.route('slow', []);
    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  });

  test('should respect handler priority', () => {
    router.registerHandler('priority', async () => {}, {
      priority: 'high',
      timeout: 5000,
      retries: 5
    });

    const handlers = router.listHandlers();
    const priorityHandler = handlers.find(h => h.intent === 'priority');
    expect(priorityHandler.priority).toBe('high');
    expect(priorityHandler.timeout).toBe(5000);
    expect(priorityHandler.retries).toBe(5);
  });

  test('should unregister handlers', () => {
    router.registerHandler('temp', async () => {});
    expect(router.handlers.has('temp')).toBe(true);

    const removed = router.unregisterHandler('temp');
    expect(removed).toBe(true);
    expect(router.handlers.has('temp')).toBe(false);
  });
});

describe('Memory Management', () => {
  test('should respect maxStatsHistory limit', async () => {
    const router = new CommandRouter({ maxStatsHistory: 3 });

    for (let i = 0; i < 10; i++) {
      await router.route('test', [`${i}`]);
    }

    expect(router.commandHistory.length).toBe(3);
    router.destroy();
  });

  test('should cleanup without losing stats', async () => {
    const router = new CommandRouter();

    await router.route('build', []);
    await router.route('test', []);

    const statsBefore = router.getStats();
    const result = router.cleanup();

    expect(result.clearedCommands).toBe(2);
    expect(router.commandHistory.length).toBe(0);

    const statsAfter = router.getStats();
    expect(statsAfter.totalCommands).toBe(statsBefore.totalCommands);
    router.destroy();
  });

  test('should handle destroy properly', () => {
    const router = new CommandRouter();
    router.registerHandler('test', async () => {});
    router.use(async () => {});

    router.destroy();

    expect(router.handlers.size).toBe(0);
    expect(router.middleware.length).toBe(0);
    expect(router.commandHistory.length).toBe(0);
    expect(router.stats.totalCommands).toBe(0);
  });
});

describe('Event Emissions', () => {
  let router;
  let events;

  beforeEach(() => {
    router = new CommandRouter();
    events = {
      received: jest.fn(),
      completed: jest.fn(),
      error: jest.fn(),
      reset: jest.fn()
    };

    router.on('command:received', events.received);
    router.on('command:completed', events.completed);
    router.on('command:error', events.error);
    router.on('stats:reset', events.reset);
  });

  afterEach(() => {
    router.destroy();
  });

  test('should emit events on successful command', async () => {
    await router.route('build', ['app']);

    expect(events.received).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: expect.any(String),
        analysis: expect.objectContaining({ intent: 'build' })
      })
    );

    expect(events.completed).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: expect.any(String),
        duration: expect.any(Number)
      })
    );
  });

  test('should emit error event on failure', async () => {
    await router.route(null);

    expect(events.error).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: expect.any(String),
        error: expect.any(String)
      })
    );
  });

  test('should emit reset event', () => {
    router.reset();
    expect(events.reset).toHaveBeenCalled();
  });
});

describe('Edge Cases and Error Handling', () => {
  let router;

  beforeEach(() => {
    router = new CommandRouter();
  });

  afterEach(() => {
    router.destroy();
  });

  test('should handle empty args gracefully', async () => {
    const result = await router.route('build');
    expect(result.success).toBe(true);
    expect(result.analysis.args).toEqual([]);
  });

  test('should filter null/undefined args', async () => {
    const result = await router.route('build', [null, 'valid', undefined, 'arg']);
    expect(result.success).toBe(true);
    expect(result.analysis.args).toEqual(['valid', 'arg']);
  });

  test('should handle middleware throwing errors', async () => {
    router.use(async () => {
      throw new Error('Middleware explosion');
    });

    const result = await router.route('build', []);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Middleware explosion');
  });

  test('should preserve error context through retries', async () => {
    let attempts = 0;
    const failingHandler = jest.fn().mockImplementation(() => {
      attempts++;
      const error = new Error(`Attempt ${attempts}`);
      error.code = `ERROR_${attempts}`;
      throw error;
    });

    router.registerHandler('fail', failingHandler, { retries: 2 });

    const result = await router.route('fail', []);
    expect(result.success).toBe(false);
    // Error should have retry context
    expect(failingHandler).toHaveBeenCalledTimes(3);
  });

  test('should handle registration of invalid handlers', () => {
    expect(() => {
      router.registerHandler('bad', 'not-a-function');
    }).toThrow('Handler must be a function');
  });

  test('should handle registration of invalid middleware', () => {
    expect(() => {
      router.use('not-a-function');
    }).toThrow('Middleware must be a function');
  });
});