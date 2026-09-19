const crypto = require('node:crypto');

const tasks = new Map();

function createTask(type, description, total = 100) {
  const id = crypto.randomBytes(16).toString('hex');
  const task = {
    id,
    type,
    description,
    progress: 0,
    total,
    status: 'running', // 'running' | 'completed' | 'failed'
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  tasks.set(id, task);
  return task;
}

function updateTask(id, updates = {}) {
  const task = tasks.get(id);
  if (!task) return null;

  Object.assign(task, updates, { updatedAt: Date.now() });
  return task;
}

function getTask(id) {
  return tasks.get(id) || null;
}

function getAllTasks() {
  return Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
}

// Prune tasks older than 1 hour
setInterval(() => {
  const cutoff = Date.now() - 3600000;
  for (const [id, task] of tasks.entries()) {
    if (task.status !== 'running' && task.createdAt < cutoff) {
      tasks.delete(id);
    }
  }
}, 60000).unref();

module.exports = {
  createTask,
  updateTask,
  getTask,
  getAllTasks
};
