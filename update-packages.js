#!/usr/bin/env node
/**
 * Update all package.json files with proper peerDependencies
 */

const fs = require('fs');
const path = require('path');

const baseDir = __dirname;

// Primitives that need @bumba/shared
const primitivesNeedingShared = [
  'token-optimizer', 'file-locking', 'rate-limiter', 'token-cost-manager',
  'context-window', 'model-supervisor', 'model-comparison', 'agent-factory',
  'territory-manager', 'health-monitor', 'error-recovery', 'failure-aware',
  'process-monitor', 'unified-memory'
];

// Primitives with no dependencies
const purePrimitives = [
  'shell-security', 'environment-detector', 'task-preparer', 'config-manager',
  'status-line', 'adaptive-planner'
];

// Update primitive packages
const primDir = path.join(baseDir, 'primitives');
fs.readdirSync(primDir).forEach(name => {
  const pkgPath = path.join(primDir, name, 'package.json');
  if (!fs.existsSync(pkgPath)) return;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  if (primitivesNeedingShared.includes(name)) {
    pkg.peerDependencies = pkg.peerDependencies || {};
    pkg.peerDependencies['@bumba/shared'] = '^1.0.0';
  }

  // Remove chalk from dependencies (use from shared)
  if (pkg.dependencies && pkg.dependencies.chalk) {
    delete pkg.dependencies.chalk;
    if (Object.keys(pkg.dependencies).length === 0) {
      delete pkg.dependencies;
    }
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Updated: primitives/${name}/package.json`);
});

// Update system packages
const sysDir = path.join(baseDir, 'systems');
fs.readdirSync(sysDir).forEach(name => {
  const pkgPath = path.join(sysDir, name, 'package.json');
  if (!fs.existsSync(pkgPath)) return;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  // All systems need @bumba/shared
  pkg.peerDependencies = pkg.peerDependencies || {};
  pkg.peerDependencies['@bumba/shared'] = '^1.0.0';

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Updated: systems/${name}/package.json`);
});

console.log('\nAll package.json files updated!');
