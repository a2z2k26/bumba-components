/**
 * Performance Benchmarks for Agent Lifecycle
 */

const { AgentOrchestrator, StateEvent } = require('../src/index');

class Benchmark {
  constructor(name) {
    this.name = name;
    this.results = [];
  }

  start() {
    this.startTime = process.hrtime.bigint();
    this.startMemory = process.memoryUsage();
  }

  end() {
    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage();

    const duration = Number(endTime - this.startTime) / 1_000_000; // Convert to ms
    const memoryDelta = {
      heapUsed: endMemory.heapUsed - this.startMemory.heapUsed,
      external: endMemory.external - this.startMemory.external
    };

    this.results.push({ duration, memoryDelta });
    return duration;
  }

  report() {
    const durations = this.results.map(r => r.duration);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const p95 = this.percentile(durations, 0.95);
    const p99 = this.percentile(durations, 0.99);

    return {
      name: this.name,
      runs: this.results.length,
      timing: {
        avg: avg.toFixed(2),
        min: min.toFixed(2),
        max: max.toFixed(2),
        p95: p95.toFixed(2),
        p99: p99.toFixed(2)
      },
      memory: {
        avgHeapDelta: (this.results.reduce((a, r) => a + r.memoryDelta.heapUsed, 0) / this.results.length / 1024).toFixed(2) + ' KB'
      }
    };
  }

  percentile(arr, p) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index];
  }
}

async function benchmarkSingleAgent() {
  const bench = new Benchmark('Single Agent Full Lifecycle');
  const iterations = 1000;

  for (let i = 0; i < iterations; i++) {
    const orchestrator = new AgentOrchestrator();

    bench.start();

    const agent = orchestrator.createAgent(`agent-${i}`);
    await agent.transition(StateEvent.SPAWN);
    await agent.transition(StateEvent.ACTIVATE, { taskCount: 5 });
    await agent.transition(StateEvent.VALIDATE);
    await agent.transition(StateEvent.COMPLETE);
    await agent.transition(StateEvent.COMPLETE);

    bench.end();

    await orchestrator.completeAll();
  }

  return bench.report();
}

async function benchmarkConcurrentAgents() {
  const bench = new Benchmark('100 Concurrent Agents');
  const iterations = 10;

  for (let i = 0; i < iterations; i++) {
    const orchestrator = new AgentOrchestrator({ maxAgents: 150 });

    bench.start();

    const promises = [];
    for (let j = 0; j < 100; j++) {
      const agent = orchestrator.createAgent(`agent-${i}-${j}`);
      promises.push(
        agent.transition(StateEvent.SPAWN)
          .then(() => agent.transition(StateEvent.ACTIVATE))
          .then(() => agent.transition(StateEvent.COMPLETE))
          .then(() => agent.transition(StateEvent.COMPLETE))
      );
    }

    await Promise.all(promises);

    bench.end();

    await orchestrator.completeAll();
  }

  return bench.report();
}

async function benchmarkStateTransitions() {
  const bench = new Benchmark('10K State Transitions');
  const iterations = 10;

  for (let i = 0; i < iterations; i++) {
    const orchestrator = new AgentOrchestrator();
    const agent = orchestrator.createAgent('test-agent');

    bench.start();

    for (let j = 0; j < 10000; j++) {
      await agent.transition(StateEvent.SPAWN);
      await agent.transition(StateEvent.ERROR);
    }

    bench.end();

    await orchestrator.completeAll();
  }

  return bench.report();
}

async function benchmarkMetricsCollection() {
  const bench = new Benchmark('Metrics Collection (1K agents)');
  const iterations = 100;

  for (let i = 0; i < iterations; i++) {
    const orchestrator = new AgentOrchestrator({ maxAgents: 1500 });

    // Create 1000 agents
    for (let j = 0; j < 1000; j++) {
      orchestrator.createAgent(`agent-${j}`);
    }

    bench.start();

    // Collect metrics 100 times
    for (let k = 0; k < 100; k++) {
      orchestrator.getMetrics();
      orchestrator.getAgentsInState('active');
      orchestrator.getSummary();
    }

    bench.end();

    await orchestrator.completeAll();
  }

  return bench.report();
}

async function benchmarkEventEmissions() {
  const bench = new Benchmark('Event Emissions (10K events)');
  const iterations = 10;

  for (let i = 0; i < iterations; i++) {
    const orchestrator = new AgentOrchestrator();
    const agent = orchestrator.createAgent('event-agent');

    let eventCount = 0;
    const handler = () => eventCount++;

    agent.on('stateChange', handler);
    agent.on('enter:spawning', handler);
    agent.on('enter:active', handler);
    orchestrator.on('agent:stateChange', handler);

    bench.start();

    for (let j = 0; j < 2500; j++) {
      await agent.transition(StateEvent.SPAWN);
      await agent.transition(StateEvent.ACTIVATE);
      await agent.transition(StateEvent.COMPLETE);
      await agent.transition(StateEvent.COMPLETE);
    }

    bench.end();

    await orchestrator.completeAll();
  }

  return bench.report();
}

async function runBenchmarks() {
  console.log(' Running Agent Lifecycle Performance Benchmarks\n');
  console.log('System:', process.platform, process.arch);
  console.log('Node:', process.version);
  console.log('Memory:', (require('os').totalmem() / 1024 / 1024 / 1024).toFixed(2), 'GB\n');

  const benchmarks = [
    benchmarkSingleAgent,
    benchmarkConcurrentAgents,
    benchmarkStateTransitions,
    benchmarkMetricsCollection,
    benchmarkEventEmissions
  ];

  const results = [];

  for (const benchmark of benchmarks) {
    process.stdout.write(`Running ${benchmark.name}...`);
    const result = await benchmark();
    results.push(result);
    console.log(' ');
  }

  console.log('\n Benchmark Results\n');
  console.log('═'.repeat(80));

  results.forEach(result => {
    console.log(`\n${result.name}`);
    console.log('─'.repeat(40));
    console.log(`Runs:     ${result.runs}`);
    console.log(`Average:  ${result.timing.avg} ms`);
    console.log(`Min:      ${result.timing.min} ms`);
    console.log(`Max:      ${result.timing.max} ms`);
    console.log(`P95:      ${result.timing.p95} ms`);
    console.log(`P99:      ${result.timing.p99} ms`);
    console.log(`Memory:   ${result.memory.avgHeapDelta} avg heap delta`);
  });

  console.log('\n' + '═'.repeat(80));
  console.log('\n Benchmarks completed successfully\n');
}

if (require.main === module) {
  runBenchmarks().catch(console.error);
}

module.exports = { Benchmark, runBenchmarks };