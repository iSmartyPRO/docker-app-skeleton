/*
 * Module resolve hook for test/module-boot.test.js: appends every resolved
 * file URL to $IMPORT_LOG, so the test can see which module folders a boot
 * set really loaded. Registered with node:module register().
 */
import { appendFileSync } from 'node:fs';

export async function resolve(specifier, context, next) {
  const result = await next(specifier, context);
  if (process.env.IMPORT_LOG && result.url?.startsWith('file:')) appendFileSync(process.env.IMPORT_LOG, `${result.url}\n`);
  return result;
}
