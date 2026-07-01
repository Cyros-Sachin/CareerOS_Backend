import { runMigrations } from "../src/db/migrate";
import { pool } from "../src/db/pool";

let setupDone = false;

export async function setup() {
  if (setupDone) return;
  setupDone = true;

  await pool.connect();
  await runMigrations();
}
