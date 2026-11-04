import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { auth, CLIENT_IP_HEADER } from "./auth";
import { prisma } from "./db";
import { requireAuth } from "./middleware/requireAuth";

export const app = express();

app.disable("x-powered-by");

// Which proxies in front of the server may set X-Forwarded-For. Default: none, so req.ip is the
// socket address and client-sent X-Forwarded-For is ignored. Set TRUST_PROXY to a hop count
// (e.g. 1) or comma-separated addresses/CIDRs (e.g. "loopback,10.0.0.0/8"). Never "true":
// that trusts the leftmost, client-controlled entry.
const trustProxy = process.env.TRUST_PROXY?.trim();
if (trustProxy) {
  if (trustProxy === "true") {
    throw new Error('TRUST_PROXY=true is unsafe; use a hop count or the proxy addresses/CIDRs');
  }
  app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
}

app.use(helmet());

// Hand Better Auth an IP the client can't forge: overwrite the header with Express's req.ip.
app.use((req, _res, next) => {
  delete req.headers[CLIENT_IP_HEADER];
  if (req.ip) req.headers[CLIENT_IP_HEADER] = req.ip;
  next();
});

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

// Final error handler: log the details server-side, never send stack traces to the client.
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({ error: "Internal Server Error" });
});
