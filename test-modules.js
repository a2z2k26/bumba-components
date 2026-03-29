#!/usr/bin/env node
/**
 * Test that all primitives and systems can be required without errors
 */

const fs = require('fs');
const path = require('path');

const baseDir = __dirname;

// Test all primitives
const primDir = path.join(baseDir, 'primitives');
const prims = fs.readdirSync(primDir).filter(d => {
  return fs.statSync(path.join(primDir, d)).isDirectory();
});

console.log('=== TESTING PRIMITIVES ===');
let primPassed = 0, primFailed = 0;

prims.forEach(p => {
  const pDir = path.join(primDir, p);
  const files = fs.readdirSync(pDir).filter(f => f.endsWith('.js') && f !== 'index.js');
  const mainFile = files[0] || 'index.js';
  try {
    require(path.join(pDir, mainFile));
    console.log('✓', p);
    primPassed++;
  } catch(e) {
    console.log('✗', p, '-', e.message.split('\n')[0].slice(0,80));
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
  const sDir = path.join(sysDir, sys);
  // Try index.js first, then first .js file
  let mainFile = 'index.js';
  if (!fs.existsSync(path.join(sDir, mainFile))) {
    const files = fs.readdirSync(sDir).filter(f => f.endsWith('.js'));
    mainFile = files[0] || 'index.js';
  }
  try {
    require(path.join(sDir, mainFile));
    console.log('✓', sys);
    sysPassed++;
  } catch(e) {
    console.log('✗', sys, '-', e.message.split('\n')[0].slice(0,80));
    sysFailed++;
  }
});

console.log(`\nSystems: ${sysPassed} passed, ${sysFailed} failed`);
console.log(`\nTotal: ${primPassed + sysPassed} passed, ${primFailed + sysFailed} failed`);

process.exit(primFailed + sysFailed > 0 ? 1 : 0);
