import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth";
import { prisma } from "./db";
import { requireAuth } from "./middleware/requireAuth";

export const app = express();

// Better Auth reads the raw request body, so it must be mounted before express.json().
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", database: "unreachable" });
  }
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json(req.session);
});
