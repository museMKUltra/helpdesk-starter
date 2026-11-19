import axios from "axios";

// Shared HTTP client for the Express API. Same-origin (Vite proxies /api in dev), so the
// Better Auth session cookie is sent automatically. Non-2xx responses reject.
export const api = axios.create({ baseURL: "/api" });
