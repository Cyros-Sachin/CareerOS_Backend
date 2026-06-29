import { pool } from "../src/db/pool";
import { logger } from "../src/lib/logger";

const SKILL_CATEGORIES: Record<string, string[]> = {
  "Languages": [
    "JavaScript", "TypeScript", "Python", "Java", "C", "C++", "C#", "Go", "Rust",
    "Kotlin", "Swift", "Ruby", "PHP", "Scala", "R", "Perl", "Haskell", "Lua",
    "Dart", "Elixir", "Clojure", "Erlang", "Julia", "Solidity", "Zig",
    "Assembly", "MATLAB", "SQL", "GraphQL", "HTML", "CSS", "Sass", "Less",
    "Shell Scripting", "Bash", "PowerShell",
  ],
  "Frontend": [
    "React", "Next.js", "Vue.js", "Angular", "Svelte", "Solid.js", "Remix",
    "Gatsby", "Nuxt.js", "Redux", "Zustand", "Recoil", "Jotai", "MobX",
    "Tailwind CSS", "Bootstrap", "Material UI", "Chakra UI", "Shadcn UI",
    "Framer Motion", "GSAP", "Three.js", "D3.js", "Chart.js", "WebGL",
    "React Native", "Flutter", "Ionic", "Electron", "Tauri", "Webpack",
    "Vite", "Rollup", "ESBuild", "Babel", "ESLint", "Prettier", "Jest",
    "React Testing Library", "Cypress", "Playwright", "Vitest",
    "Storybook", "PWA", "WebSockets", "SSR", "SSG", "ISR",
  ],
  "Backend": [
    "Node.js", "Express", "NestJS", "Fastify", "Koa", "Hono", "Elysia",
    "Django", "Flask", "FastAPI", "Spring Boot", "ASP.NET", "Laravel",
    "Ruby on Rails", "Gin", "Echo", "Fiber", "Actix", "Rocket", "Axum",
    "Phoenix", "REST API", "GraphQL API", "gRPC", "WebSocket", "Socket.io",
    "Apollo Server", "tRPC", "OpenAPI", "Swagger", "Postman",
    "JWT", "OAuth 2.0", "OIDC", "SAML", "RBAC", "CORS", "CSRF",
    "Rate Limiting", "API Gateway", "Microservices", "Message Queue",
    "RabbitMQ", "Apache Kafka", "NATS", "BullMQ", "Redis Queue",
    "Serverless", "AWS Lambda", "Cloudflare Workers", "Vercel Functions",
  ],
  "Databases": [
    "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Firebase Firestore",
    "Supabase", "PlanetScale", "Neon", "CockroachDB", "MariaDB",
    "Redis", "Elasticsearch", "Meilisearch", "Algolia", "Typesense",
    "DynamoDB", "Cassandra", "ScyllaDB", "CouchDB", "PocketBase",
    "Prisma", "Drizzle ORM", "TypeORM", "Mongoose", "Knex.js",
    "pgvector", "Neo4j", "ArangoDB", "InfluxDB", "TimescaleDB",
    "Migrations", "Database Design", "Query Optimization", "Indexing",
    "ACID", "CAP Theorem", "Sharding", "Replication", "Connection Pooling",
  ],
  "DevOps/Cloud": [
    "AWS", "Amazon S3", "Amazon EC2", "Amazon RDS", "Amazon Lambda",
    "Amazon ECS", "Amazon EKS", "CloudFront", "Route 53", "AWS IAM",
    "Google Cloud", "GCP Compute", "GCP Cloud Run", "GCP GKE",
    "Azure", "Azure Functions", "Azure Kubernetes",
    "Docker", "Kubernetes", "Helm", "Terraform", "Pulumi",
    "CI/CD", "GitHub Actions", "GitLab CI", "Jenkins", "CircleCI",
    "Nginx", "Apache", "Caddy", "Traefik", "HAProxy",
    "Linux", "Ubuntu", "Alpine", "System Administration",
    "Monitoring", "Prometheus", "Grafana", "Datadog", "New Relic",
    "Sentry", "Logging", "ELK Stack", "OpenTelemetry",
    "Cloudflare", "Vercel", "Netlify", "Railway", "Fly.io",
  ],
  "DSA & CS Fundamentals": [
    "Arrays", "Strings", "Linked Lists", "Stacks", "Queues", "Hash Tables",
    "Trees", "Binary Trees", "Binary Search Trees", "Heaps", "Tries",
    "Graphs", "Dynamic Programming", "Greedy Algorithms", "Divide and Conquer",
    "Backtracking", "Recursion", "Sorting Algorithms", "Searching Algorithms",
    "Time Complexity", "Space Complexity", "Big O Notation", "System Design",
    "Object-Oriented Programming", "Functional Programming", "Design Patterns",
    "SOLID Principles", "Clean Architecture", "Domain-Driven Design",
    "Operating Systems", "Computer Networks", "Database Systems",
    "Compiler Design", "Computer Architecture", "Parallel Computing",
    "LeetCode", "Codeforces", "Competitive Programming",
  ],
  "Mobile": [
    "Android Development", "iOS Development", "Kotlin Multiplatform",
    "SwiftUI", "UIKit", "Jetpack Compose", "XML Layouts",
    "React Native", "Expo", "Flutter", "Dart",
    "Xcode", "Android Studio", "Gradle", "CocoaPods",
    "Firebase", "Push Notifications", "App Store Connect", "Google Play Console",
    "Mobile UI/UX", "Material Design", "Human Interface Guidelines",
    "SQLite Mobile", "Core Data", "Room Database",
    "Mobile Security", "App Signing", "ProGuard", "Code Push",
  ],
  "AI/ML": [
    "Machine Learning", "Deep Learning", "Neural Networks", "NLP",
    "Computer Vision", "Reinforcement Learning", "Generative AI",
    "LLMs", "GPT", "Gemini", "Claude", "LangChain", "LlamaIndex",
    "Hugging Face", "Transformers", "PyTorch", "TensorFlow", "Keras",
    "Scikit-learn", "Pandas", "NumPy", "Jupyter", "JAX",
    "RAG", "Vector Databases", "pgvector", "ChromaDB", "Pinecone",
    "OpenAI API", "Gemini API", "Anthropic API", "Ollama",
    "Fine-tuning", "Prompt Engineering", "AI Agents", "Function Calling",
    "MLOps", "Model Deployment", "ONNX", "TensorRT", "CUDA",
    "Data Science", "Statistical Analysis", "A/B Testing", "Experimentation",
    "Data Engineering", "ETL", "Apache Spark", "Airflow", "dbt",
  ],
  "Soft Skills": [
    "Communication", "Team Collaboration", "Leadership", "Mentoring",
    "Code Review", "Technical Writing", "Documentation", "Public Speaking",
    "Agile", "Scrum", "Kanban", "Project Management", "Jira",
    "Problem Solving", "Critical Thinking", "Decision Making",
    "Time Management", "Remote Work", "Cross-team Collaboration",
    "Client Management", "Stakeholder Management", "Product Thinking",
  ],
  "Tools": [
    "Git", "GitHub", "GitLab", "Bitbucket", "GitHub CLI",
    "VS Code", "WebStorm", "IntelliJ", "Vim", "Neovim",
    "npm", "yarn", "pnpm", "bun", "npx",
    "curl", "jq", "htop", "tmux", "screen", "zsh",
    "Figma", "Sketch", "Adobe XD", "Notion", "Linear",
    "Slack", "Discord", "Zoom", "Google Meet",
    "Wireshark", "Postman", "Insomnia", "Bruno",
    "Homebrew", "apt", "yum", "apk", "choco",
    "ffmpeg", "ImageMagick", "Pandoc", "LuaTeX",
  ],
};

const ROLE_REQUIREMENTS: Record<string, Array<{ skill: string; weight: number; proficiency: string; hours: number }>> = {
  "SDE": [
    { skill: "JavaScript", weight: 1.0, proficiency: "advanced", hours: 100 },
    { skill: "TypeScript", weight: 0.9, proficiency: "advanced", hours: 60 },
    { skill: "Python", weight: 0.8, proficiency: "mid", hours: 80 },
    { skill: "Data Structures", weight: 1.0, proficiency: "advanced", hours: 120 },
    { skill: "Algorithms", weight: 1.0, proficiency: "advanced", hours: 120 },
    { skill: "System Design", weight: 0.9, proficiency: "mid", hours: 100 },
    { skill: "Git", weight: 0.8, proficiency: "advanced", hours: 20 },
    { skill: "SQL", weight: 0.7, proficiency: "mid", hours: 40 },
    { skill: "REST API", weight: 0.8, proficiency: "advanced", hours: 30 },
    { skill: "Docker", weight: 0.6, proficiency: "mid", hours: 30 },
    { skill: "CI/CD", weight: 0.5, proficiency: "mid", hours: 20 },
    { skill: "React", weight: 0.7, proficiency: "advanced", hours: 80 },
    { skill: "Node.js", weight: 0.7, proficiency: "advanced", hours: 60 },
    { skill: "PostgreSQL", weight: 0.6, proficiency: "mid", hours: 40 },
    { skill: "Redis", weight: 0.5, proficiency: "mid", hours: 20 },
    { skill: "DSA & CS Fundamentals", weight: 1.0, proficiency: "advanced", hours: 200 },
    { skill: "Object-Oriented Programming", weight: 0.8, proficiency: "advanced", hours: 40 },
    { skill: "Microservices", weight: 0.6, proficiency: "mid", hours: 50 },
    { skill: "AWS", weight: 0.5, proficiency: "beginner", hours: 40 },
    { skill: "Testing", weight: 0.6, proficiency: "mid", hours: 30 },
  ],
  "Data Analyst": [
    { skill: "SQL", weight: 1.0, proficiency: "advanced", hours: 80 },
    { skill: "Python", weight: 1.0, proficiency: "advanced", hours: 80 },
    { skill: "Pandas", weight: 0.9, proficiency: "advanced", hours: 40 },
    { skill: "NumPy", weight: 0.8, proficiency: "mid", hours: 30 },
    { skill: "Data Visualization", weight: 0.8, proficiency: "mid", hours: 40 },
    { skill: "Excel", weight: 0.8, proficiency: "advanced", hours: 40 },
    { skill: "Statistics", weight: 0.9, proficiency: "mid", hours: 60 },
    { skill: "Tableau", weight: 0.7, proficiency: "mid", hours: 40 },
    { skill: "Power BI", weight: 0.6, proficiency: "mid", hours: 30 },
    { skill: "R", weight: 0.5, proficiency: "beginner", hours: 40 },
    { skill: "Data Cleaning", weight: 0.9, proficiency: "advanced", hours: 30 },
    { skill: "A/B Testing", weight: 0.6, proficiency: "mid", hours: 20 },
    { skill: "Communication", weight: 0.7, proficiency: "advanced", hours: 10 },
    { skill: "Problem Solving", weight: 0.7, proficiency: "advanced", hours: 10 },
  ],
  "Frontend Developer": [
    { skill: "JavaScript", weight: 1.0, proficiency: "advanced", hours: 120 },
    { skill: "TypeScript", weight: 0.9, proficiency: "advanced", hours: 60 },
    { skill: "React", weight: 1.0, proficiency: "advanced", hours: 100 },
    { skill: "HTML", weight: 1.0, proficiency: "advanced", hours: 30 },
    { skill: "CSS", weight: 1.0, proficiency: "advanced", hours: 60 },
    { skill: "Tailwind CSS", weight: 0.7, proficiency: "mid", hours: 20 },
    { skill: "Next.js", weight: 0.8, proficiency: "advanced", hours: 60 },
    { skill: "REST API", weight: 0.8, proficiency: "mid", hours: 30 },
    { skill: "GraphQL", weight: 0.5, proficiency: "beginner", hours: 30 },
    { skill: "Git", weight: 0.7, proficiency: "mid", hours: 20 },
    { skill: "Jest", weight: 0.6, proficiency: "mid", hours: 20 },
    { skill: "Cypress", weight: 0.5, proficiency: "mid", hours: 20 },
    { skill: "Webpack", weight: 0.5, proficiency: "mid", hours: 15 },
    { skill: "Vite", weight: 0.5, proficiency: "mid", hours: 10 },
    { skill: "Responsive Design", weight: 0.8, proficiency: "advanced", hours: 30 },
    { skill: "Accessibility", weight: 0.6, proficiency: "mid", hours: 20 },
    { skill: "Performance Optimization", weight: 0.7, proficiency: "mid", hours: 30 },
    { skill: "Figma", weight: 0.5, proficiency: "beginner", hours: 20 },
    { skill: "PWA", weight: 0.4, proficiency: "beginner", hours: 20 },
  ],
  "Backend Developer": [
    { skill: "Node.js", weight: 0.9, proficiency: "advanced", hours: 80 },
    { skill: "TypeScript", weight: 0.8, proficiency: "advanced", hours: 60 },
    { skill: "Python", weight: 0.7, proficiency: "mid", hours: 60 },
    { skill: "SQL", weight: 0.9, proficiency: "advanced", hours: 60 },
    { skill: "PostgreSQL", weight: 0.8, proficiency: "advanced", hours: 50 },
    { skill: "REST API", weight: 1.0, proficiency: "advanced", hours: 40 },
    { skill: "GraphQL", weight: 0.5, proficiency: "mid", hours: 30 },
    { skill: "Redis", weight: 0.6, proficiency: "mid", hours: 20 },
    { skill: "Docker", weight: 0.7, proficiency: "mid", hours: 30 },
    { skill: "AWS", weight: 0.6, proficiency: "mid", hours: 50 },
    { skill: "CI/CD", weight: 0.5, proficiency: "mid", hours: 20 },
    { skill: "Microservices", weight: 0.6, proficiency: "mid", hours: 50 },
    { skill: "System Design", weight: 0.8, proficiency: "mid", hours: 80 },
    { skill: "Authentication", weight: 0.8, proficiency: "advanced", hours: 30 },
    { skill: "API Design", weight: 0.8, proficiency: "advanced", hours: 30 },
    { skill: "Message Queue", weight: 0.5, proficiency: "beginner", hours: 20 },
    { skill: "Testing", weight: 0.6, proficiency: "mid", hours: 30 },
    { skill: "Git", weight: 0.7, proficiency: "advanced", hours: 15 },
    { skill: "Linux", weight: 0.6, proficiency: "mid", hours: 20 },
  ],
  "ML Engineer": [
    { skill: "Python", weight: 1.0, proficiency: "advanced", hours: 120 },
    { skill: "Machine Learning", weight: 1.0, proficiency: "advanced", hours: 150 },
    { skill: "Deep Learning", weight: 0.9, proficiency: "advanced", hours: 100 },
    { skill: "PyTorch", weight: 0.9, proficiency: "advanced", hours: 80 },
    { skill: "TensorFlow", weight: 0.7, proficiency: "mid", hours: 60 },
    { skill: "NLP", weight: 0.7, proficiency: "mid", hours: 60 },
    { skill: "Computer Vision", weight: 0.6, proficiency: "mid", hours: 60 },
    { skill: "SQL", weight: 0.6, proficiency: "mid", hours: 30 },
    { skill: "Pandas", weight: 0.8, proficiency: "advanced", hours: 30 },
    { skill: "NumPy", weight: 0.8, proficiency: "advanced", hours: 20 },
    { skill: "Scikit-learn", weight: 0.8, proficiency: "advanced", hours: 40 },
    { skill: "Data Engineering", weight: 0.5, proficiency: "beginner", hours: 40 },
    { skill: "MLOps", weight: 0.6, proficiency: "mid", hours: 40 },
    { skill: "Docker", weight: 0.5, proficiency: "mid", hours: 20 },
    { skill: "Statistics", weight: 0.8, proficiency: "advanced", hours: 60 },
    { skill: "Probability", weight: 0.8, proficiency: "advanced", hours: 40 },
    { skill: "RAG", weight: 0.5, proficiency: "beginner", hours: 30 },
    { skill: "LLMs", weight: 0.5, proficiency: "mid", hours: 40 },
    { skill: "Git", weight: 0.5, proficiency: "mid", hours: 15 },
    { skill: "Production Deployment", weight: 0.5, proficiency: "beginner", hours: 40 },
  ],
};

async function seed() {
  logger.info("Seeding skills taxonomy...");

  const skillIdMap = new Map<string, string>();

  for (const [category, skills] of Object.entries(SKILL_CATEGORIES)) {
    for (const skillName of skills) {
      const result = await pool.query(
        `INSERT INTO skills (name, category)
         VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET category = EXCLUDED.category
         RETURNING id`,
        [skillName, category]
      );
      skillIdMap.set(skillName, result.rows[0].id);
    }
  }

  logger.info({ total: skillIdMap.size }, "Skills seeded");

  logger.info("Seeding role requirements...");
  let reqCount = 0;

  for (const [roleName, requirements] of Object.entries(ROLE_REQUIREMENTS)) {
    for (const req of requirements) {
      const skillId = skillIdMap.get(req.skill);
      if (!skillId) {
        logger.warn({ skill: req.skill, role: roleName }, "Skill not found for role requirement");
        continue;
      }

      await pool.query(
        `INSERT INTO role_requirements (role_name, skill_id, importance_weight, min_proficiency, est_learning_hours)
         VALUES ($1, $2, $3, $4::proficiency_level, $5)
         ON CONFLICT (role_name, skill_id) DO UPDATE SET
           importance_weight = EXCLUDED.importance_weight,
           min_proficiency = EXCLUDED.min_proficiency,
           est_learning_hours = EXCLUDED.est_learning_hours`,
        [roleName, skillId, req.weight, req.proficiency, req.hours]
      );
      reqCount++;
    }
  }

  logger.info({ roles: Object.keys(ROLE_REQUIREMENTS).length, requirements: reqCount }, "Role requirements seeded");
  logger.info("Seeding complete");

  await pool.end();
}

seed().catch((err) => {
  logger.error({ err }, "Seed failed");
  process.exit(1);
});
