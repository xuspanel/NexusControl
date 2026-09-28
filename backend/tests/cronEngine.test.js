const { getCrontab, getSystemdTimers, getCronHistory } = require('../cronEngine');
const cronstrue = require('cronstrue');

describe('Cron Engine Tests', () => {
  test('cronstrue produces human-readable descriptions', () => {
    expect(cronstrue.toString('0 0 * * *')).toContain('midnight');
    expect(cronstrue.toString('*/5 * * * *')).toContain('5 minutes');
    expect(cronstrue.toString('0 12 * * 1-5')).toContain('Monday through Friday');
  });

  test('getCrontab returns an array of structured jobs', () => {
    const jobs = getCrontab();
    expect(Array.isArray(jobs)).toBe(true);
    if (jobs.length > 0) {
      expect(jobs[0]).toHaveProperty('schedule');
      expect(jobs[0]).toHaveProperty('command');
      expect(jobs[0]).toHaveProperty('humanReadable');
    }
  });

  test('getSystemdTimers returns an array of active systemd timers', () => {
    const timers = getSystemdTimers();
    expect(Array.isArray(timers)).toBe(true);
    if (timers.length > 0) {
      expect(timers[0]).toHaveProperty('unit');
      expect(timers[0]).toHaveProperty('nextRun');
    }
  });

  test('getCronHistory returns past execution records', () => {
    const history = getCronHistory(10);
    expect(Array.isArray(history)).toBe(true);
  });
});
