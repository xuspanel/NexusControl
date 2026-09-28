#!/usr/bin/env node

/**
 * NexusControl Cron Wrapper Script
 * Captures execution metrics, output logs, duration, and exit codes in SQLite.
 *
 * Usage:
 *   node /opt/NexusControl/backend/cronWrapper.js "/path/to/command.sh arg1 arg2"
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

// Extract target command from process.argv
const rawArgs = process.argv.slice(2);
if (rawArgs.length === 0) {
  console.error('[cronWrapper] Error: No command specified to execute.');
  process.exit(1);
}

// Join args if passed as separate arguments, or use single command string
const commandToRun = rawArgs.length === 1 ? rawArgs[0] : rawArgs.join(' ');

// Load database handler
let dbHandler = null;
try {
  dbHandler = require('./db');
  if (dbHandler.initDb) {
    dbHandler.initDb();
  }
} catch (err) {
  // If loading via relative path fails, try absolute path
  try {
    dbHandler = require('/opt/NexusControl/backend/db');
    if (dbHandler.initDb) {
      dbHandler.initDb();
    }
  } catch (innerErr) {
    console.warn('[cronWrapper] Warning: Could not initialize database:', innerErr.message);
  }
}

const startTime = Date.now();
let stdoutData = '';
let stderrData = '';

// Spawn command with shell
const child = spawn(commandToRun, {
  shell: true,
  env: process.env
});

if (child.stdout) {
  child.stdout.on('data', (chunk) => {
    stdoutData += chunk.toString();
    process.stdout.write(chunk);
  });
}

if (child.stderr) {
  child.stderr.on('data', (chunk) => {
    stderrData += chunk.toString();
    process.stderr.write(chunk);
  });
}

child.on('error', (err) => {
  const durationMs = Date.now() - startTime;
  const errMsg = `[cronWrapper] Execution error: ${err.message}`;
  stderrData += `\n${errMsg}`;
  console.error(errMsg);

  if (dbHandler && dbHandler.recordCronExecution) {
    try {
      dbHandler.recordCronExecution(commandToRun, 1, stdoutData, stderrData, durationMs);
    } catch {}
  }

  process.exit(1);
});

child.on('close', (code, signal) => {
  const durationMs = Date.now() - startTime;
  const exitCode = typeof code === 'number' ? code : (signal ? 128 : 0);

  if (dbHandler && dbHandler.recordCronExecution) {
    try {
      dbHandler.recordCronExecution(commandToRun, exitCode, stdoutData, stderrData, durationMs);
    } catch (err) {
      console.error('[cronWrapper] Failed to record execution history:', err.message);
    }
  }

  process.exit(exitCode);
});
