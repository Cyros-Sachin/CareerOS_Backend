import { Pool, types } from "pg";
import { env } from "../config/env";

types.setTypeParser(1114, (v: string) => new Date(Date.parse(v + "+0000")));

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
console.log("DATABASE_URL =", process.env.DATABASE_URL);
pool.on("error", (err) => {
  console.error("Unexpected pool error:", err);
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
