import { SDK_VERSION } from '@portal/sdk';

/* A JS migration: up(db) runs inside the migration transaction. */
export async function up(db) {
  await db.query(`INSERT INTO hello_messages (text) VALUES ($1)`, [`seeded with SDK ${SDK_VERSION}`]);
}
