import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Database file path - consistent with auth.ts
const DB_PATH = path.resolve(__dirname, "..", "..", "database.sqlite");

export interface DatabaseInterface {
  run: (sql: string, params?: any[]) => any;
  get: (sql: string, params?: any[]) => any;
  all: (sql: string, params?: any[]) => any[];
  close: () => void;
}

export class DatabaseConnection implements DatabaseInterface {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  run(sql: string, params?: any[]): any {
    // If there are parameters, use prepare/run (single statement)
    if (params && params.length > 0) {
      const stmt = this.db.prepare(sql);
      return stmt.run(...params);
    }

    // If the SQL contains multiple statements (indicated by semicolons between statements)
    // use exec(), otherwise use prepare/run for safety
    const trimmedSql = sql.trim();
    const statementCount = (trimmedSql.match(/;/g) || []).length;
    const hasNewlines = trimmedSql.includes("\n");

    if (statementCount > 1 || (statementCount === 1 && hasNewlines)) {
      // Multiple statements or complex statement with newlines (like triggers)
      return this.db.exec(trimmedSql);
    } else {
      // Single simple statement
      const stmt = this.db.prepare(trimmedSql);
      return stmt.run();
    }
  }

  get(sql: string, params?: any[]) {
    const stmt = this.db.prepare(sql);
    return stmt.get(...(params || []));
  }

  all(sql: string, params?: any[]) {
    const stmt = this.db.prepare(sql);
    return stmt.all(...(params || []));
  }

  close() {
    this.db.close();
  }
}

export function createDatabase(): DatabaseInterface {
  const db = new Database(DB_PATH);
  if (process.env.NODE_ENV !== "test") {
    console.log("Connected to SQLite database at:", DB_PATH);
  }
  return new DatabaseConnection(db);
}

export function runMigrations(): void {
  const db = createDatabase();

  try {
    // Enable foreign keys
    db.run("PRAGMA foreign_keys = ON");

    // First, load BetterAuth migrations if they exist
    const betterAuthMigrationsDir = path.join(
      __dirname,
      "..",
      "..",
      "better-auth_migrations"
    );
    if (fs.existsSync(betterAuthMigrationsDir)) {
      const betterAuthFiles = fs
        .readdirSync(betterAuthMigrationsDir)
        .filter((file) => file.endsWith(".sql"))
        .sort();

      for (const file of betterAuthFiles) {
        const filePath = path.join(betterAuthMigrationsDir, file);
        const sql = fs.readFileSync(filePath, "utf8").trim();

        if (sql) {
          if (process.env.NODE_ENV !== "test") {
            console.log(`Running BetterAuth migration: ${file}`);
          }
          db.run(sql);
        }
      }
    }

    // Then load custom migrations
    const migrationsDir = path.join(__dirname, "migrations");
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    if (process.env.NODE_ENV !== "test") {
      console.log("Running database migrations...");
    }

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf8").trim();

      // Skip empty migration files
      if (!sql) {
        if (process.env.NODE_ENV !== "test") {
          console.log(`Skipping empty migration: ${file}`);
        }
        continue;
      }

      if (process.env.NODE_ENV !== "test") {
        console.log(`Running migration: ${file}`);
      }
      db.run(sql);
    }

    if (process.env.NODE_ENV !== "test") {
      console.log("All migrations completed successfully!");
    }
  } catch (error) {
    console.error("Error running migrations:", error);
    throw error;
  } finally {
    db.close();
  }
}

export function getDatabase(): DatabaseInterface {
  // Use test database if we're in test environment
  if (process.env.NODE_ENV === "test") {
    const { testDb } = require("../tests/setup.js");
    // Enable foreign keys for test database
    testDb.run("PRAGMA foreign_keys = ON");
    return testDb;
  }

  const db = createDatabase();
  // Enable foreign keys for this connection
  db.run("PRAGMA foreign_keys = ON");
  return db;
}
