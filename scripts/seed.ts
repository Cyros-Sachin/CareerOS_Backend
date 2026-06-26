import { pool } from "../src/db/pool";
import { hashPassword } from "../src/lib/password";

async function seed() {
  const passwordHash = await hashPassword("TestPass1");

  await pool.query(
    `INSERT INTO users (email, password_hash, name, email_verified, role)
     VALUES ($1, $2, $3, TRUE, 'student')
     ON CONFLICT (email) DO NOTHING`,
    ["test@careeros.app", passwordHash, "Test Student"]
  );

  await pool.query(
    `INSERT INTO users (email, password_hash, name, email_verified, role)
     VALUES ($1, $2, $3, TRUE, 'institution_admin')
     ON CONFLICT (email) DO NOTHING`,
    ["admin@careeros.app", passwordHash, "Test Admin"]
  );

  console.log("Seed data inserted");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
