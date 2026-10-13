import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import dotenv from 'dotenv';
import { quoteEnvValue, upsertEnvLine, writeEnvValues } from '../services/envFile.js';

const TRICKY = [
  'simple',
  'p$$w0rd',
  'a$&b$1c$`d',
  'back\\slash',
  'with "double" quotes',
  "it's",
  "it's a #hash and spaces",
  'hash # inside',
  '  leading and trailing  ',
  'pa$s#w"o\\rd',
  'tab\there',
  '`backtick`',
  "quote ' and `tick`",
  '',
];

test('quoted .env values read back exactly with dotenv', () => {
  for (const value of TRICKY) {
    const parsed = dotenv.parse(`KEY=${quoteEnvValue(value)}\nNEXT=1\n`);
    assert.equal(parsed.KEY, value, `round-trip of ${JSON.stringify(value)}`);
    assert.equal(parsed.NEXT, '1');
  }
});

test('values no parser pair can read the same are refused, not mangled', () => {
  for (const value of ["it's $5", "it's \\", 'it\'s "x"', 'line\nbreak', 'ends with backslash\\']) {
    assert.throws(() => quoteEnvValue(value), (err) => err.statusCode === 400 && err.code === 'ENV_VALUE_UNSAFE');
  }
});

test('replacing a line keeps $ patterns in the value literally', () => {
  const content = 'A=1\nPOSTGRES_PASSWORD=old\nB=2\n';
  const next = upsertEnvLine(content, 'POSTGRES_PASSWORD', 'x$&y$$z$1');
  assert.equal(dotenv.parse(next).POSTGRES_PASSWORD, 'x$&y$$z$1');
  assert.equal(dotenv.parse(next).B, '2');
});

test('writeEnvValues writes a temp .env that dotenv reads back', () => {
  const dir = mkdtempSync(join(tmpdir(), 'envfile-'));
  const path = join(dir, '.env');
  const previous = process.env.ENV_FILE_PATH;
  const saved = { ENVTEST_A: process.env.ENVTEST_A, ENVTEST_B: process.env.ENVTEST_B };
  try {
    writeFileSync(path, 'ENVTEST_A=old\n# comment\n');
    process.env.ENV_FILE_PATH = path;
    writeEnvValues({ ENVTEST_A: 'n$$ew#1 "x"', ENVTEST_B: "o'k" });
    const parsed = dotenv.parse(readFileSync(path, 'utf-8'));
    assert.equal(parsed.ENVTEST_A, 'n$$ew#1 "x"');
    assert.equal(parsed.ENVTEST_B, "o'k");
    assert.equal(process.env.ENVTEST_A, 'n$$ew#1 "x"');
    // An unsafe value changes nothing.
    const before = readFileSync(path, 'utf-8');
    assert.throws(() => writeEnvValues({ ENVTEST_A: 'fine', ENVTEST_B: "bad'$" }));
    assert.equal(readFileSync(path, 'utf-8'), before);
    assert.equal(process.env.ENVTEST_A, 'n$$ew#1 "x"');
  } finally {
    if (previous === undefined) delete process.env.ENV_FILE_PATH;
    else process.env.ENV_FILE_PATH = previous;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
