// Provide harmless defaults so modules that read env at import time (e.g. the
// DB pool, credential crypto) don't throw when loaded in unit tests. The real
// database is always mocked in tests, so this connection string is never used.
process.env["DATABASE_URL"] ??= "postgres://test:test@localhost:5432/test";
process.env["CREDENTIALS_SECRET"] ??= "test-secret";
