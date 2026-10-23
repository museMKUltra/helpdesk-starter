import express from "express";
import { prisma } from "./db";

export const app = express();

app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", database: "unreachable" });
  }
});
