import { query, withTransaction } from '../../config/database.js';
import { getSetting, setSetting } from '../../services/settings.js';
import { registerJob } from '../../services/scheduler.js';
import { ensureAclTable, LEVEL } from '../shared/acl.js';
import { runCustomReminders, runReminders } from './reminders.js';
import { runRecurring } from './templates.js';
import { registerTaskChat } from './chat.js';
import { purgeDraftFiles } from './extras.js';

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

  await ensureTasksV2();

  registerJob({ name: 'tasks:reminders', everyMs: 5 * 60 * 1000, run: runReminders });
  registerJob({ name: 'tasks:custom-reminders', everyMs: 60 * 1000, run: runCustomReminders });
  registerJob({ name: 'tasks:recurring', everyMs: 5 * 60 * 1000, run: runRecurring });
  registerJob({ name: 'tasks:draft-files', everyMs: 6 * 60 * 60 * 1000, run: purgeDraftFiles });
  await seedTasks();
  await ensurePersonalProject();
  registerTaskChat();
}

/*
 * Version 2: roles, result control, hierarchy, planning, time tracking,
 * several checklists, files, reminders, templates (and recurring tasks),
 * flows, custom fields, views, favourites and rating. Every task also has a
 * conversation in the chat module (chat.js), which replaced comments.
 *
 *   task_members     co-assignees and auditors ("наблюдатели") of a task
 *   task_checklists  named checklists; task_checklist rows are their items
 *   task_files       files of a task: uploads, Files nodes, file server paths
 *   task_results     reports that close a task when a result is required
 *   task_links       related tasks; task_deps — Gantt links (FS, SS, SF, FF)
 *   task_reminders   who to remind, when and how
 *   task_time        time tracking intervals
 *   task_templates   templates; recurring tasks are templates with a schedule
 *   task_flows       queues of tasks with automatic distribution
 *   task_fields      custom fields (values live in tasks.custom)
 *   task_views, task_favorites
 */
async function ensureTasksV2() {
  const columns = [
    `important BOOLEAN NOT NULL DEFAULT FALSE`,
    `originator_id INTEGER REFERENCES users(id) ON DELETE SET NULL`,
    `parent_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL`,
    `result_required BOOLEAN NOT NULL DEFAULT FALSE`,
    `flow_id INTEGER`,
    `plan_start TIMESTAMPTZ`,
    `plan_end TIMESTAMPTZ`,
    `allow_change_deadline BOOLEAN NOT NULL DEFAULT TRUE`,
    `skip_weekends BOOLEAN NOT NULL DEFAULT FALSE`,
    `deadline_from_subtasks BOOLEAN NOT NULL DEFAULT FALSE`,
    `time_tracking BOOLEAN NOT NULL DEFAULT FALSE`,
    `time_estimate INTEGER`,
    `custom JSONB NOT NULL DEFAULT '{}'`,
    `deferred_at TIMESTAMPTZ`,
    `started_at TIMESTAMPTZ`,
    `rating VARCHAR(8)`,
    `rating_comment TEXT`,
    `template_id INTEGER`,
    `description_format VARCHAR(8) NOT NULL DEFAULT 'md'`,
  ];
  for (const column of columns) await query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ${column}`);
  await query(`UPDATE tasks SET originator_id = created_by WHERE originator_id IS NULL AND created_by IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS tasks_parent_idx ON tasks (parent_id) WHERE parent_id IS NOT NULL`);
  await query(`ALTER TABLE task_projects ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT FALSE`);

  await query(`
    CREATE TABLE IF NOT EXISTS task_members (
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(12) NOT NULL,
      PRIMARY KEY (task_id, user_id, role)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS task_members_user_idx ON task_members (user_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS task_checklists (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0
    )
  `);
  for (const column of [
    `checklist_id INTEGER REFERENCES task_checklists(id) ON DELETE CASCADE`,
    `level SMALLINT NOT NULL DEFAULT 0`,
    `important BOOLEAN NOT NULL DEFAULT FALSE`,
    `member_id INTEGER REFERENCES users(id) ON DELETE SET NULL`,
    `member_role VARCHAR(12)`,
    `file_ids INTEGER[] NOT NULL DEFAULT '{}'`,
    `done_by INTEGER REFERENCES users(id) ON DELETE SET NULL`,
  ]) {
    await query(`ALTER TABLE task_checklist ADD COLUMN IF NOT EXISTS ${column}`);
  }
  // Items made before named checklists get one per task.
  await query(`
    INSERT INTO task_checklists (task_id, title, sort)
    SELECT DISTINCT c.task_id, 'Checklist', 0 FROM task_checklist c
    WHERE c.checklist_id IS NULL AND NOT EXISTS (SELECT 1 FROM task_checklists l WHERE l.task_id = c.task_id)
  `);
  await query(`
    UPDATE task_checklist c SET checklist_id = (SELECT id FROM task_checklists l WHERE l.task_id = c.task_id ORDER BY sort, id LIMIT 1)
    WHERE c.checklist_id IS NULL
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS task_files (
      id SERIAL PRIMARY KEY,
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      kind VARCHAR(8) NOT NULL DEFAULT 'upload',
      name VARCHAR(255) NOT NULL,
      mime VARCHAR(120),
      size BIGINT NOT NULL DEFAULT 0,
      storage_key VARCHAR(200),
      node_id INTEGER,
      share_id INTEGER,
      drive_path TEXT,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS task_files_task_idx ON task_files (task_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS task_results (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body TEXT NOT NULL DEFAULT '',
      chat_file_ids INTEGER[] NOT NULL DEFAULT '{}',
      message_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS task_links (
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      other_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, other_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS task_deps (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      depends_on INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      kind VARCHAR(2) NOT NULL DEFAULT 'FS',
      UNIQUE (task_id, depends_on)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS task_reminders (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
      targets TEXT[] NOT NULL DEFAULT '{}',
      mode VARCHAR(8) NOT NULL DEFAULT 'at',
      remind_at TIMESTAMPTZ,
      before_minutes INTEGER,
      channels TEXT[] NOT NULL DEFAULT '{app}',
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS task_time (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      stopped_at TIMESTAMPTZ
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS task_templates (
      id SERIAL PRIMARY KEY,
      title VARCHAR(300) NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
      shared BOOLEAN NOT NULL DEFAULT FALSE,
      recurring BOOLEAN NOT NULL DEFAULT FALSE,
      recurrence JSONB,
      next_run_at TIMESTAMPTZ,
      runs INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS task_flows (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      color VARCHAR(7),
      project_id INTEGER REFERENCES task_projects(id) ON DELETE SET NULL,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      member_ids INTEGER[] NOT NULL DEFAULT '{}',
      distribution VARCHAR(8) NOT NULL DEFAULT 'manual',
      cursor INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS task_fields (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      type VARCHAR(8) NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS task_views (
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (task_id, user_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS task_favorites (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, task_id)
    )
  `);
}

/**
 * Tasks without a project live in a hidden personal project ("TSK"): nobody
 * sees it as a project; each of its tasks is open to its own participants.
 */
export async function ensurePersonalProject() {
  const { rows } = await query(`SELECT id FROM task_projects WHERE is_personal LIMIT 1`);
  if (rows[0]) return rows[0].id;
  const locale = process.env.SEED_LOCALE || 'ru';
  return withTransaction(async (client) => {
    const key = (await client.query(`SELECT 1 FROM task_projects WHERE key = 'TSK'`)).rows.length ? 'TASK' : 'TSK';
    const created = await client.query(
      `INSERT INTO task_projects (key, name, description, color, icon, is_personal) VALUES ($1, $2, '', '#64748B', 'tasks', TRUE) RETURNING id`,
      [key, locale === 'ru' ? 'Без проекта' : 'No project']
    );
    await insertStatuses(client, created.rows[0].id, locale);
    return created.rows[0].id;
  });
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
