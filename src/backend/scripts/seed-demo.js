// Adds the sample users (no passwords) to an existing installation.
// Usage: npm run seed:demo   (inside the container: make seed-demo)
import { closePool } from '../config/database.js';
import { bootstrapSchema } from '../services/schema.js';
import { seedDemoUsers } from '../services/rbac.js';

try {
  await bootstrapSchema();
  const created = await seedDemoUsers();
  console.log(`Demo users created: ${created}`);
} catch (err) {
  console.error('Seeding failed:', err.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
