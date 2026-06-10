import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";

import authRoutes from "./modules/auth/auth.routes";
import onboardingRoutes
from "./modules/onboarding/onboarding.routes";
import resumeRoutes
from "./modules/resume/resume.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";

const app = express();

app.use(helmet());
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(compression());
app.use(morgan("dev"));

app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use(
  "/api/onboarding",
  onboardingRoutes
);
app.use(
  "/api/resume",
  resumeRoutes
);
app.use(
  "/api/dashboard",
  dashboardRoutes
);
export default app;