import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import documentRoutes from "./routes/document.routes.js";
import tokenRoutes from "./routes/token.routes.js";
import logRoutes from "./routes/log.routes.js";
import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

// ─── Global Middleware ────────────────────────────────────────────────────────
const corsOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(
  ","
);

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/tokens", tokenRoutes);
app.use("/api/logs", logRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

export default app;
