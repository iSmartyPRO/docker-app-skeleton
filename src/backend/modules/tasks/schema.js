import { query, withTransaction } from '../../config/database.js';
import { getSetting, setSetting } from '../../services/settings.js';
import { registerJob } from '../../services/scheduler.js';
import { ensureAclTable, LEVEL } from '../shared/acl.js';
import { runReminders } from './reminders.js';

/*
 * Tasks: projects (with access lists and their own workflow of statuses),
 * tasks numbered per project (HR-12), checklists, comments, watchers and an
 * activity history.
 */

export async function ensureTasksSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS task_projects (
      id SERIAL PRIMARY KEY,
      key VARCHAR(10) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      color VARCHAR(7),
      icon VARCHAR(32),
      seq INTEGER NOT NULL DEFAULT 0,
      archived_at TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await ensureAclTable('task_acl', 'task_projects');
  await query(`
    CREATE TABLE IF NOT EXISTS task_statuses (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES task_projects(id) ON DELETE CASCADE,
      name VARCHAR(60) NOT NULL,
      color VARCHAR(7) NOT NULL DEFAULT '#94A3B8',
      category VARCHAR(8) NOT NULL DEFAULT 'todo',
      sort INTEGER NOT NULL DEFAULT 0
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES task_projects(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      title VARCHAR(300) NOT NULL,
      description TEXT,
      status_id INTEGER NOT NULL REFERENCES task_statuses(id),
      priority SMALLINT NOT NULL DEFAULT 1,
      assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      start_date DATE,
      due_at TIMESTAMPTZ,
      due_time BOOLEAN NOT NULL DEFAULT FALSE,
      labels TEXT[] NOT NULL DEFAULT '{}',
      rank DOUBLE PRECISION NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      due_notified_at TIMESTAMPTZ,
      overdue_notified_at TIMESTAMPTZ,
      UNIQUE (project_id, number)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS tasks_project_status_idx ON tasks (project_id, status_id, rank)`);
  await query(`CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON tasks (assignee_id) WHERE completed_at IS NULL`);
  await query(`CREATE INDEX IF NOT EXISTS tasks_due_idx ON tasks (due_at) WHERE completed_at IS NULL`);
  await query(`
    CREATE TABLE IF NOT EXISTS task_checklist (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      text VARCHAR(500) NOT NULL,
      done BOOLEAN NOT NULL DEFAULT FALSE,
      sort INTEGER NOT NULL DEFAULT 0
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS task_comments (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      edited_at TIMESTAMPTZ
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS task_watchers (
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, user_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS task_activity (
      id BIGSERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      kind VARCHAR(32) NOT NULL,
      data JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS task_activity_task_idx ON task_activity (task_id, id)`);

  registerJob({ name: 'tasks:reminders', everyMs: 5 * 60 * 1000, run: runReminders });
  await seedTasks();
}

export const DEFAULT_STATUSES = {
  en: [
    { name: 'To do', color: '#94A3B8', category: 'todo' },
    { name: 'In progress', color: '#3B82F6', category: 'active' },
    { name: 'Review', color: '#F59E0B', category: 'active' },
    { name: 'Done', color: '#10B981', category: 'done' },
  ],
  ru: [
    { name: 'К выполнению', color: '#94A3B8', category: 'todo' },
    { name: 'В работе', color: '#3B82F6', category: 'active' },
    { name: 'На проверке', color: '#F59E0B', category: 'active' },
    { name: 'Готово', color: '#10B981', category: 'done' },
  ],
};

export async function insertStatuses(client, projectId, locale) {
  const list = DEFAULT_STATUSES[locale === 'ru' ? 'ru' : 'en'];
  for (const [index, status] of list.entries()) {
    await client.query(
      `INSERT INTO task_statuses (project_id, name, color, category, sort) VALUES ($1, $2, $3, $4, $5)`,
      [projectId, status.name, status.color, status.category, index]
    );
  }
}

/** One starter project, once, after the first user exists. */
async function seedTasks() {
  if ((await getSetting('tasks_seeded')) === 'true') return;
  const { rows } = await query(`SELECT id, locale FROM users ORDER BY id LIMIT 1`);
  if (!rows[0]) return;
  const locale = process.env.SEED_LOCALE || rows[0].locale || 'en';
  const ru = locale === 'ru';
  await withTransaction(async (client) => {
    const project = await client.query(
      `INSERT INTO task_projects (key, name, description, color, icon, created_by)
       VALUES ('GEN', $1, $2, '#6366F1', 'rocket', $3) ON CONFLICT (key) DO NOTHING RETURNING id`,
      [
        ru ? 'Общие задачи' : 'General',
        ru ? 'Задачи команды, которые не относятся к отдельному проекту.' : 'Team tasks that do not belong to a specific project.',
        rows[0].id,
      ]
    );
    const id = project.rows[0]?.id;
    if (!id) return;
    await client.query(`INSERT INTO task_acl (resource_id, subject_type, subject_id, level) VALUES ($1, 'everyone', NULL, $2)`, [id, LEVEL.edit]);
    await insertStatuses(client, id, locale);
  });
  await setSetting('tasks_seeded', 'true');
}
