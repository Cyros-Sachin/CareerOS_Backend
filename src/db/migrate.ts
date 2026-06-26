import fs from "fs";
import path from "path";
import { pool } from "./pool";
import { env } from "../config/env";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

export async function runMigrations(dir: string = MIGRATIONS_DIR) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT NOW()
    );
  `);

  const applied = await pool.query("SELECT version FROM schema_migrations ORDER BY version");
  const appliedVersions = new Set(applied.rows.map((r: any) => r.version));

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const match = file.match(/^(\d+)_.*\.sql$/);
    if (!match) continue;
    const version = parseInt(match[1], 10);
    if (appliedVersions.has(version)) continue;

    const sql = fs.readFileSync(path.join(dir, file), "utf-8");
    console.log(`Running migration: ${file}`);

    try {
      await pool.query("BEGIN");
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [version, file]);
      await pool.query("COMMIT");
      console.log(`  ✓ ${file}`);
    } catch (err) {
      await pool.query("ROLLBACK");
      console.error(`  ✗ ${file} failed:`, err);
      throw err;
    }
  }

  console.log("All migrations applied.");
}

async function main() {
  try {
    await runMigrations();
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}
