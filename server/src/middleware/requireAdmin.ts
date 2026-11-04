import type { NextFunction, Request, Response } from "express";
import { Role } from "../generated/prisma/enums";

// Use after requireAuth: `app.get("/api/admin/...", requireAuth, requireAdmin, handler)`.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.session.user.role !== Role.admin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
