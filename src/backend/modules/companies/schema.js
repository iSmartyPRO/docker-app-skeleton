import { query } from '../../config/database.js';
import { registerJob } from '../../services/scheduler.js';
import { purgeTempDocuments } from './files.js';

/*
 * Counterparties: companies and the people who work there.
 *
 *   cmp_companies   a company card: country-specific identifiers (ids JSON),
 *                   registry data, addresses, contacts, bank accounts,
 *                   relation (client, supplier…), responsible employee
 *   cmp_people      a contact person; never deleted when they change jobs
 *   cmp_positions   employment: person × company with dates — the career
 *                   history; ended_on IS NULL means "works there now"
 *   cmp_events      the timeline: who did what and when (changes with diffs,
 *                   registry checks, notes, calls, meetings, ratings)
 *   cmp_ratings     scores (1–5) with criteria, per author, kept as history
 *   cmp_files       registry extracts and other documents of a company
 */

export async function ensureCompaniesSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS cmp_companies (
      id SERIAL PRIMARY KEY,
      country VARCHAR(8) NOT NULL DEFAULT 'KG',
      kind VARCHAR(12) NOT NULL DEFAULT 'legal',
      name VARCHAR(300) NOT NULL,
      full_name TEXT,
      local_name TEXT,
      legal_form VARCHAR(60),
      ids JSONB NOT NULL DEFAULT '{}',
      status VARCHAR(16) NOT NULL DEFAULT 'unknown',
      registered_on DATE,
      closed_on DATE,
      registering_authority TEXT,
      legal_address TEXT,
      actual_address TEXT,
      director_name VARCHAR(200),
      director_title VARCHAR(200),
      founders_count INTEGER,
      activity TEXT,
      activity_code VARCHAR(20),
      industry VARCHAR(120),
      employees VARCHAR(20),
      phones JSONB NOT NULL DEFAULT '[]',
      emails JSONB NOT NULL DEFAULT '[]',
      website VARCHAR(300),
      messengers JSONB NOT NULL DEFAULT '{}',
      bank_accounts JSONB NOT NULL DEFAULT '[]',
      relations TEXT[] NOT NULL DEFAULT '{}',
      tags TEXT[] NOT NULL DEFAULT '{}',
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT,
      custom JSONB NOT NULL DEFAULT '{}',
      registry JSONB,
      archived_at TIMESTAMPTZ,
      archived_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      archive_reason TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS cmp_companies_name_idx ON cmp_companies (LOWER(name))`);
  await query(`CREATE INDEX IF NOT EXISTS cmp_companies_ids_idx ON cmp_companies USING GIN (ids)`);

  await query(`
    CREATE TABLE IF NOT EXISTS cmp_people (
      id SERIAL PRIMARY KEY,
      last_name VARCHAR(120),
      first_name VARCHAR(120) NOT NULL,
      middle_name VARCHAR(120),
      birthday DATE,
      gender VARCHAR(8),
      phones JSONB NOT NULL DEFAULT '[]',
      emails JSONB NOT NULL DEFAULT '[]',
      messengers JSONB NOT NULL DEFAULT '{}',
      country VARCHAR(8),
      city VARCHAR(120),
      languages TEXT[] NOT NULL DEFAULT '{}',
      tags TEXT[] NOT NULL DEFAULT '{}',
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT,
      custom JSONB NOT NULL DEFAULT '{}',
      archived_at TIMESTAMPTZ,
      archived_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      archive_reason TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS cmp_people_name_idx ON cmp_people (LOWER(last_name), LOWER(first_name))`);

  await query(`
    CREATE TABLE IF NOT EXISTS cmp_positions (
      id SERIAL PRIMARY KEY,
      person_id INTEGER NOT NULL REFERENCES cmp_people(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES cmp_companies(id) ON DELETE CASCADE,
      title VARCHAR(200),
      department VARCHAR(200),
      is_primary BOOLEAN NOT NULL DEFAULT TRUE,
      is_decision_maker BOOLEAN NOT NULL DEFAULT FALSE,
      work_phone VARCHAR(60),
      work_email VARCHAR(200),
      started_on DATE,
      ended_on DATE,
      end_reason TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS cmp_positions_person_idx ON cmp_positions (person_id)`);
  await query(`CREATE INDEX IF NOT EXISTS cmp_positions_company_idx ON cmp_positions (company_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS cmp_events (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(8) NOT NULL,
      entity_id INTEGER NOT NULL,
      kind VARCHAR(16) NOT NULL,
      body TEXT,
      data JSONB NOT NULL DEFAULT '{}',
      happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS cmp_events_entity_idx ON cmp_events (entity_type, entity_id, happened_at DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS cmp_ratings (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(8) NOT NULL,
      entity_id INTEGER NOT NULL,
      score SMALLINT NOT NULL,
      criteria JSONB NOT NULL DEFAULT '{}',
      comment TEXT,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS cmp_ratings_entity_idx ON cmp_ratings (entity_type, entity_id, created_at DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS cmp_files (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES cmp_companies(id) ON DELETE CASCADE,
      kind VARCHAR(12) NOT NULL DEFAULT 'file',
      name VARCHAR(255) NOT NULL,
      storage_key TEXT NOT NULL,
      size BIGINT NOT NULL DEFAULT 0,
      source VARCHAR(40),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  registerJob({ name: 'companies:temp', everyMs: 60 * 60 * 1000, run: purgeTempDocuments });
}
