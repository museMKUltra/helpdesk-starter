import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth, type Session } from "../auth";

declare global {
  namespace Express {
    interface Request {
      session?: Session;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.session = session;
  next();
}
