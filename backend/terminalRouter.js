const express = require('express');
const terminalSessions = require('./terminalSessions');
const terminalPresets = require('./terminalPresets');

const router = express.Router();

// 1. Get all presets
router.get('/presets', (req, res) => {
  try {
    const presets = terminalPresets.getAllPresets();
    res.json({ presets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Add custom preset
router.post('/presets', (req, res) => {
  try {
    const { title, command, category, description } = req.body || {};
    if (!title || !command) {
      return res.status(400).json({ error: 'title and command are required.' });
    }
    const preset = terminalPresets.addPreset({ title, command, category, description });
    res.json({ success: true, preset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Delete custom preset
router.delete('/presets/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = terminalPresets.deletePreset(id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. List active terminal sessions
router.get('/sessions', (req, res) => {
  try {
    const sessions = terminalSessions.listSessions();
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Create new terminal session
router.post('/sessions', (req, res) => {
  try {
    const { title, cols, rows } = req.body || {};
    const session = terminalSessions.createSession({ title, cols, rows });
    res.json({
      id: session.id,
      title: session.title,
      cols: session.cols,
      rows: session.rows,
      createdAt: session.createdAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Kill terminal session
router.delete('/sessions/:id', (req, res) => {
  try {
    const { id } = req.params;
    terminalSessions.destroySession(id);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
