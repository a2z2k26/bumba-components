/**
 * Health Check Example
 * Demonstrates health monitoring and debug logging
 */

const { AgentOrchestrator, StateEvent } = require('../src/index');

// Enable debug logging
process.env.DEBUG = 'agent-lifecycle';

async function simulateWorkload(orchestrator) {
  // Create some healthy agents
  for (let i = 0; i < 3; i++) {
    const agent = orchestrator.createAgent(`healthy-${i}`);
    await agent.transition(StateEvent.SPAWN);
    await agent.transition(StateEvent.ACTIVATE);

    // Complete after some work
    setTimeout(async () => {
      await agent.transition(StateEvent.COMPLETE);
      await agent.transition(StateEvent.COMPLETE);
    }, 2000 + i * 1000);
  }

  // Create a stuck agent (simulated)
  const stuckAgent = orchestrator.createAgent('stuck-agent');
  await stuckAgent.transition(StateEvent.SPAWN);
  await stuckAgent.transition(StateEvent.ACTIVATE);
  // Never completes - will be detected as stuck

  // Create some slow agents
  for (let i = 0; i < 2; i++) {
    const slowAgent = orchestrator.createAgent(`slow-${i}`);
    await slowAgent.transition(StateEvent.SPAWN);
    // Takes a long time to activate - will trigger warnings
  }
}

async function monitorHealth(orchestrator) {
  console.log('\n🏥 Health Monitoring Dashboard\n');
  console.log('═'.repeat(60));

  const healthInterval = setInterval(() => {
    const health = orchestrator.getHealth();

    console.log('\n📊 Health Check at', health.timestamp);
    console.log('─'.repeat(40));

    // Status indicator
    const statusEmoji = {
      healthy: '✅',
      degraded: '⚠️',
      warning: '🟡',
      unhealthy: '🔴'
    };

    console.log(`Status: ${statusEmoji[health.status]} ${health.status.toUpperCase()}`);
    console.log('\nOrchestrator Stats:');
    console.log(`  Total Agents: ${health.orchestrator.totalAgents}/${health.orchestrator.maxAgents}`);
    console.log(`  Active: ${health.orchestrator.activeAgents}`);
    console.log(`  Utilization: ${health.orchestrator.utilization}`);
    console.log(`  Completed: ${health.orchestrator.totalCompleted}`);

    console.log('\nState Distribution:');
    Object.entries(health.stateDistribution).forEach(([state, count]) => {
      if (count > 0) {
        console.log(`  ${state}: ${count}`);
      }
    });

    if (health.issues.stuck.length > 0) {
      console.log('\n🔴 Stuck Agents:');
      health.issues.stuck.forEach(agent => {
        const stuckMinutes = Math.floor(agent.stuckDuration / 60000);
        console.log(`  - ${agent.id}: stuck in ${agent.state} for ${stuckMinutes} minutes`);
        console.log(`    Last change: ${agent.lastChange}`);
      });
    }

    if (health.issues.warnings.length > 0) {
      console.log('\n⚠️  Warning Agents:');
      health.issues.warnings.forEach(agent => {
        const minutes = Math.floor(agent.duration / 60000);
        console.log(`  - ${agent.id}: in ${agent.state} for ${minutes} minutes`);
      });
    }

    if (health.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      health.recommendations.forEach(rec => {
        console.log(`  • ${rec}`);
      });
    }

    console.log('\n' + '─'.repeat(40));
  }, 3000);

  return healthInterval;
}

async function createHealthEndpoint(orchestrator) {
  // Simulate HTTP endpoint
  const getHealthEndpoint = () => {
    const health = orchestrator.getHealth();
    const httpStatus = health.status === 'healthy' ? 200 :
                       health.status === 'degraded' ? 200 :
                       health.status === 'warning' ? 200 :
                       503; // unhealthy

    return {
      status: httpStatus,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify(health, null, 2)
    };
  };

  // Simulate health check requests
  console.log('\n🌐 Health Endpoint Example:');
  console.log('GET /health');

  const response = getHealthEndpoint();
  console.log(`HTTP ${response.status}`);
  console.log('Response:', response.body);

  return getHealthEndpoint;
}

async function demo() {
  console.log('🚀 Agent Health Monitoring Demo');
  console.log('Debug logging is enabled (DEBUG=agent-lifecycle)\n');

  const orchestrator = new AgentOrchestrator({
    maxAgents: 10,
    defaultAgentConfig: {
      maxActiveTime: 60000,  // 1 minute
      maxIdleTime: 30000     // 30 seconds
    }
  });

  // Start workload
  await simulateWorkload(orchestrator);

  // Start health monitoring
  const healthInterval = await monitorHealth(orchestrator);

  // Create health endpoint
  const healthEndpoint = await createHealthEndpoint(orchestrator);

  // Simulate recovery after 15 seconds
  setTimeout(async () => {
    console.log('\n🔧 Attempting recovery of stuck agents...\n');

    const health = orchestrator.getHealth();

    // Force complete stuck agents
    for (const stuck of health.issues.stuck) {
      const agent = orchestrator.getAgent(stuck.id);
      if (agent) {
        console.log(`Force completing ${stuck.id}`);
        await agent.forceComplete('health-recovery');
      }
    }
  }, 15000);

  // Stop after 30 seconds
  setTimeout(async () => {
    clearInterval(healthInterval);

    console.log('\n🏁 Final Health Report:');
    const finalHealth = orchestrator.getHealth();
    console.log(JSON.stringify(finalHealth, null, 2));

    await orchestrator.completeAll('demo-end');
    process.exit(0);
  }, 30000);
}

if (require.main === module) {
  demo().catch(console.error);
}

module.exports = { monitorHealth, createHealthEndpoint };