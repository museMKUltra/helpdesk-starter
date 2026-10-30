import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navigate, useNavigate } from "react-router";
import { signIn, useSession } from "../lib/auth-client";

const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

type LoginValues = z.infer<typeof loginSchema>;

// Soft 3px halo on focus instead of the browser outline; red variant when the field is invalid.
const inputClass =
  "mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-xs transition-[border-color,box-shadow] duration-150 " +
  "hover:border-gray-400 focus:border-blue-500 focus:outline-hidden focus:ring-3 focus:ring-blue-500/20 " +
  "aria-invalid:border-red-500 aria-invalid:focus:border-red-500 aria-invalid:focus:ring-red-500/20";

export default function LoginPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  if (isPending) return null;
  if (session) return <Navigate to="/" replace />;

  async function onSubmit(values: LoginValues) {
    const { error } = await signIn.email(values);
    if (error) {
      setError("root.server", { message: error.message ?? "Invalid email or password" });
      return;
    }
    navigate("/", { replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <form
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Sign in to Helpdesk</h1>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Email</span>
          <input
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...register("email")}
            className={inputClass}
          />
          {errors.email && <span className="mt-1 block text-sm text-red-600">{errors.email.message}</span>}
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register("password")}
            className={inputClass}
          />
          {errors.password && <span className="mt-1 block text-sm text-red-600">{errors.password.message}</span>}
        </label>

        {errors.root?.server && (
          <p role="alert" className="text-sm text-red-600">
            {errors.root.server.message}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-700 focus-visible:outline-hidden focus-visible:ring-3 focus-visible:ring-blue-500/40 disabled:opacity-50"
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
