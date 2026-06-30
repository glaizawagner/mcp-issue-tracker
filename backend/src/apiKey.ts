import crypto from "crypto";
import { getDatabase } from "./db/database.js";

const PREFIX = "issues_";

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(userId: string, name?: string) {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const secret = crypto.randomBytes(24).toString("hex");
  const plainKey = `${PREFIX}${secret}`;
  const keyHash = hashKey(plainKey);

  db.run(
    "INSERT INTO api_key (id, key_hash, prefix, user_id, name) VALUES (?, ?, ?, ?, ?)",
    [id, keyHash, PREFIX, userId, name ?? null]
  );

  return { id, key: plainKey };
}

export function verifyApiKey(plainKey: string): { userId: string } | null {
  if (!plainKey || !plainKey.startsWith(PREFIX)) {
    return null;
  }

  const db = getDatabase();
  const keyHash = hashKey(plainKey);
  const row = db.get(
    "SELECT user_id FROM api_key WHERE key_hash = ?",
    [keyHash]
  );

  if (!row) {
    return null;
  }

  db.run("UPDATE api_key SET last_used_at = datetime('now') WHERE key_hash = ?", [
    keyHash,
  ]);

  return { userId: row.user_id };
}
