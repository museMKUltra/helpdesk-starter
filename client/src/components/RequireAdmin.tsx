import { Navigate, Outlet } from "react-router";
import { useSession } from "../lib/auth-client";

// Layout route nested inside RequireAuth: renders the child route only for admins, otherwise redirects home.
export default function RequireAdmin() {
  const { data: session } = useSession();

  if (session?.user.role !== "admin") return <Navigate to="/" replace />;

  return <Outlet />;
}
