-- role_keywords is superseded by skills + role_requirements (migrations 010-011).
-- Data was migrated in migration 010. The scoring service read path has been
-- updated to use the skills table. Once you've confirmed the switchover works
-- in production, uncomment the line below:
-- DROP TABLE IF EXISTS role_keywords;

-- This migration is intentionally a no-op. Run the DROP manually after
-- verifying that ATS Compatibility scoring works correctly with the new
-- skills-based read path.
