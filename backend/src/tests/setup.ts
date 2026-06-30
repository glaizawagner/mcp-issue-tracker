import { beforeAll, beforeEach, afterAll } from "vitest";
import Database from "better-sqlite3";
import { DatabaseConnection } from "../db/database.js";

let testDb: DatabaseConnection;

beforeAll(() => {
  // Use in-memory database for tests to avoid permission issues
  const sqliteDb = new Database(":memory:");

  testDb = new DatabaseConnection(sqliteDb);

  // Create tables manually for testing instead of running migrations
  try {
    // BetterAuth user table (matches actual schema)
    testDb.run(`
      CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        emailVerified INTEGER NOT NULL,
        image TEXT,
        createdAt DATE NOT NULL,
        updatedAt DATE NOT NULL
      )
    `);

    // BetterAuth session table (matches actual schema)
    testDb.run(`
      CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY,
        expiresAt DATE NOT NULL,
        token TEXT UNIQUE NOT NULL,
        createdAt DATE NOT NULL,
        updatedAt DATE NOT NULL,
        ipAddress TEXT,
        userAgent TEXT,
        userId TEXT NOT NULL REFERENCES user(id)
      )
    `);

    // BetterAuth account table
    testDb.run(`
      CREATE TABLE IF NOT EXISTS account (
        id TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        providerId TEXT NOT NULL,
        userId TEXT NOT NULL REFERENCES user(id),
        accessToken TEXT,
        refreshToken TEXT,
        expiresAt DATE,
        createdAt DATE NOT NULL,
        updatedAt DATE NOT NULL
      )
    `);

    // BetterAuth verification table
    testDb.run(`
      CREATE TABLE IF NOT EXISTS verification (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expiresAt DATE NOT NULL,
        createdAt DATE NOT NULL,
        updatedAt DATE
      )
    `);

    // Custom tables
    testDb.run(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        color TEXT DEFAULT '#gray',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    testDb.run(`
      CREATE TABLE IF NOT EXISTS issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
        assigned_user_id TEXT,
        created_by_user_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        FOREIGN KEY (assigned_user_id) REFERENCES user(id),
        FOREIGN KEY (created_by_user_id) REFERENCES user(id)
      )
    `);

    testDb.run(`
      CREATE TABLE IF NOT EXISTS issue_tags (
        issue_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (issue_id, tag_id),
        FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `);

    // Create indices
    testDb.run(
      `CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status)`
    );
    testDb.run(
      `CREATE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority)`
    );
    testDb.run(
      `CREATE INDEX IF NOT EXISTS idx_issues_created_by ON issues(created_by_user_id)`
    );
    testDb.run(
      `CREATE INDEX IF NOT EXISTS idx_issues_assigned_to ON issues(assigned_user_id)`
    );
  } catch (err) {
    console.error("Error creating test database tables:", err);
    throw err;
  }
});

beforeEach(() => {
  // Clear all data before each test
  try {
    testDb.run("DELETE FROM issue_tags");
    testDb.run("DELETE FROM issues");
    testDb.run("DELETE FROM tags");
    testDb.run("DELETE FROM session");
    testDb.run("DELETE FROM account");
    testDb.run("DELETE FROM verification");
    testDb.run("DELETE FROM user");

    // Create the default test user that routes expect when skipAuth is enabled
    testDb.run(
      "INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        "test-user-1",
        "Test User",
        "test@example.com",
        1,
        null,
        new Date().toISOString(),
        new Date().toISOString(),
      ]
    );
  } catch (err) {
    console.error("Error cleaning up test data:", err);
    throw err;
  }
});

afterAll(() => {
  if (testDb) {
    try {
      const sqliteDb = (testDb as any).db;
      sqliteDb.close();
    } catch (err) {
      console.warn("Error closing test database:", err);
    }
  }
});

export { testDb };
