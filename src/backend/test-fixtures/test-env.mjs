// Imported first by tests that need a signing secret: config reads JWT_SECRET when it loads,
// and CI has no .env (static imports are evaluated in order, so this runs before config).
process.env.JWT_SECRET ||= 'test-secret-for-unit-tests-1234567890';
