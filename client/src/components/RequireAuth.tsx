import { Navigate, Outlet } from "react-router";
import { useSession } from "../lib/auth-client";
import NavBar from "./NavBar";

// Layout route: redirects to /login when signed out, otherwise renders the nav and the child route.
export default function RequireAuth() {
  const { data: session, isPending } = useSession();

  if (isPending) return <p className="p-8 text-gray-500">Loading…</p>;
  if (!session) return <Navigate to="/login" replace />;

  return (
    <>
      <NavBar userName={session.user.name} />
      <Outlet />
    </>
  );
}
