const { execSync, spawnSync } = require('node:child_process');
const path = require('node:path');
const cronstrue = require('cronstrue');
const db = require('./db');

const WRAPPER_PATH = '/opt/NexusControl/backend/cronWrapper.js';

/**
 * Executes a shell command and returns output string.
 * Returns empty string on failure rather than throwing.
 */
function safeExec(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch (err) {
    // crontab -l exits with code 1 if user has no crontab
    return '';
  }
}

/**
 * Translates a cron schedule expression into plain English.
 */
function toHumanReadable(schedule) {
  try {
    return cronstrue.toString(schedule, { use24HourTimeFormat: true, throwExceptionOnParseError: false });
  } catch {
    return schedule;
  }
}

/**
 * Reads and parses the user's crontab into structured job objects.
 */
function getCrontab() {
  const rawCrontab = safeExec('crontab -l');
  if (!rawCrontab.trim()) {
    return [];
  }

  const lines = rawCrontab.split('\n');
  const jobs = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith('#')) {
      continue;
    }

    // Cron line format: 5 time fields or @special, then command
    const match = rawLine.match(/^(@\w+|\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/);
    if (!match) continue;

    const schedule = match[1].trim();
    const rawCommand = match[2].trim();

    // Check if command is wrapped by our cronWrapper.js
    // Patterns: node /opt/NexusControl/backend/cronWrapper.js "..." or /usr/bin/node ...
    const wrapperPattern = /cronWrapper\.js\s+["']?([^"']+)["']?$/;
    const wrapperMatch = rawCommand.match(wrapperPattern);

    let isWrapped = false;
    let command = rawCommand;

    if (wrapperMatch && wrapperMatch[1]) {
      isWrapped = true;
      command = wrapperMatch[1].trim();
    }

    jobs.push({
      id: `cron_${i}`,
      schedule,
      humanReadable: toHumanReadable(schedule),
      command,
      rawCommand,
      isWrapped,
      rawLine
    });
  }

  return jobs;
}

/**
 * Saves crontab lines back to the system via crontab -
 */
function writeCrontab(rawContent) {
  const cleanContent = rawContent.endsWith('\n') ? rawContent : `${rawContent}\n`;
  const result = spawnSync('crontab', ['-'], {
    input: cleanContent,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || 'Failed to update system crontab');
  }

  return true;
}

/**
 * Adds a new scheduled job wrapped with cronWrapper.js
 */
function addCronJob(schedule, command) {
  if (!schedule || !command) {
    throw new Error('Both schedule and command are required.');
  }

  const cleanSchedule = schedule.trim();
  const cleanCommand = command.trim();

  // Validate schedule format
  const cronRegex = /^(@(reboot|yearly|annually|monthly|weekly|daily|midnight|hourly)|\S+\s+\S+\s+\S+\s+\S+\s+\S+)$/;
  if (!cronRegex.test(cleanSchedule)) {
    throw new Error('Invalid cron schedule expression.');
  }

  const currentCrontab = safeExec('crontab -l');
  const wrappedCmd = `node ${WRAPPER_PATH} "${cleanCommand.replace(/"/g, '\\"')}"`;
  const newEntry = `${cleanSchedule} ${wrappedCmd}`;

  const updatedCrontab = currentCrontab.trim()
    ? `${currentCrontab.trim()}\n# NexusControl Managed Job\n${newEntry}\n`
    : `# NexusControl Managed Job\n${newEntry}\n`;

  writeCrontab(updatedCrontab);
  return {
    schedule: cleanSchedule,
    command: cleanCommand,
    humanReadable: toHumanReadable(cleanSchedule)
  };
}

/**
 * Deletes a job from the crontab matching the command string.
 */
function deleteCronJob(targetCommand) {
  if (!targetCommand) {
    throw new Error('Target command is required for deletion.');
  }

  const rawCrontab = safeExec('crontab -l');
  if (!rawCrontab.trim()) {
    return false;
  }

  const lines = rawCrontab.split('\n');
  const filtered = [];
  let deleted = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      filtered.push(lines[i]);
      continue;
    }

    if (line.startsWith('#')) {
      // Check if next line is the matching job, so we can clean up comment
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine.includes(targetCommand)) {
          // Skip this comment line
          continue;
        }
      }
      filtered.push(lines[i]);
      continue;
    }

    // Check if line matches targetCommand directly or wrapped
    if (line.includes(targetCommand)) {
      deleted = true;
      continue; // Skip line to delete it
    }

    filtered.push(lines[i]);
  }

  if (deleted) {
    writeCrontab(filtered.join('\n'));
  }

  return deleted;
}

/**
 * Parses systemctl list-timers output into structured JSON.
 */
function getSystemdTimers() {
  const output = safeExec('systemctl list-timers --all --no-pager --full');
  if (!output.trim()) {
    return [];
  }

  const lines = output.split('\n');
  const timers = [];

  // Find header index
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('NEXT') && lines[i].includes('UNIT')) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) return [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.includes('timers listed')) continue;

    // Use regex to capture fields:
    // e.g.: Mon 2026-09-28 20:39:00 UTC 1min 30s Mon 2026-09-28 20:09:28 UTC 28min ago phpsessionclean.timer phpsessionclean.service
    const parts = line.split(/\s{2,}/);
    if (parts.length >= 4) {
      const nextRun = parts[0] || '-';
      const left = parts[1] || '-';
      const lastRun = parts[2] || '-';
      const passed = parts[3] || '-';
      const unit = parts[4] || '-';
      const activates = parts[5] || parts[4]?.replace('.timer', '.service') || '-';

      timers.push({
        nextRun: nextRun.trim(),
        left: left.trim(),
        lastRun: lastRun.trim(),
        passed: passed.trim(),
        unit: unit.trim(),
        activates: activates.trim()
      });
    }
  }

  return timers;
}

module.exports = {
  getCrontab,
  addCronJob,
  deleteCronJob,
  getSystemdTimers,
  getCronHistory: db.getCronHistory
};
