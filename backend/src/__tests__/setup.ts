// Set required environment variables before any module is imported.
// This prevents env.ts from calling process.exit(1) in the test environment.
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db'
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long-ok'
process.env.FRONTEND_URL = 'http://localhost:5173'
