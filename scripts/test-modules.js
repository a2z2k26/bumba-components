#!/usr/bin/env node
/**
 * Test that all primitives and systems can be required without errors
 */

const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname, '..');

// Resolve a package's entry point, honoring package.json#main when present.
function resolveEntry(pkgDir) {
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      if (pkg.main) return path.join(pkgDir, pkg.main);
    } catch (_) { /* fall through to heuristics */ }
  }
  if (fs.existsSync(path.join(pkgDir, 'index.js'))) {
    return path.join(pkgDir, 'index.js');
  }
  const firstJs = fs.readdirSync(pkgDir).find(f => f.endsWith('.js'));
  return firstJs ? path.join(pkgDir, firstJs) : path.join(pkgDir, 'index.js');
}

// Test all primitives
const primDir = path.join(baseDir, 'primitives');
const prims = fs.readdirSync(primDir).filter(d => {
  return fs.statSync(path.join(primDir, d)).isDirectory();
});

console.log('=== TESTING PRIMITIVES ===');
let primPassed = 0, primFailed = 0;

prims.forEach(p => {
  const entry = resolveEntry(path.join(primDir, p));
  try {
    require(entry);
    console.log('', p);
    primPassed++;
  } catch(e) {
    console.log('', p, '-', e.message.split('\n')[0].slice(0,80));
    primFailed++;
  }
});

console.log(`\nPrimitives: ${primPassed} passed, ${primFailed} failed\n`);

// Test system entry points
console.log('=== TESTING SYSTEMS ===');
const sysDir = path.join(baseDir, 'systems');
const systems = fs.readdirSync(sysDir).filter(d => {
  return fs.statSync(path.join(sysDir, d)).isDirectory();
});

let sysPassed = 0, sysFailed = 0;

systems.forEach(sys => {
  const entry = resolveEntry(path.join(sysDir, sys));
  try {
    require(entry);
    console.log('', sys);
    sysPassed++;
  } catch(e) {
    console.log('', sys, '-', e.message.split('\n')[0].slice(0,80));
    sysFailed++;
  }
});

console.log(`\nSystems: ${sysPassed} passed, ${sysFailed} failed`);
console.log(`\nTotal: ${primPassed + sysPassed} passed, ${primFailed + sysFailed} failed`);

process.exit(primFailed + sysFailed > 0 ? 1 : 0);
