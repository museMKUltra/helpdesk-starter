import { useNavigate } from "react-router";
import { signOut } from "../lib/auth-client";

export default function NavBar({ userName }: { userName: string }) {
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <nav className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <span className="text-lg font-semibold">Helpdesk</span>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-700">{userName}</span>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
