import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { resolveGoogleRedirectResult } from "@/lib/firebase";

const GOOGLE_REDIRECT_FLAG = "google-redirect-pending";

const heroImage =
  "https://static.prod-images.emergentagent.com/jobs/522d1ae5-e3a1-4a99-90c4-276bd1db41d5/images/3067d5d0c23655b3bd7934e2b86bf899036a2fd224dc234b027724f3ae1d11e2.png";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, register, googleLogin, isAuthenticated } = useAuth();
  const [mode, setMode] = useState("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
  });

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (!sessionStorage.getItem(GOOGLE_REDIRECT_FLAG)) {
      return;
    }

    let mounted = true;

    const consumeRedirectResult = async () => {
      try {
        const result = await resolveGoogleRedirectResult();
        const googleUser = result?.user;
        if (!googleUser?.email || !googleUser?.uid || !mounted) {
          return;
        }

        sessionStorage.removeItem(GOOGLE_REDIRECT_FLAG);
        await googleLogin({
          email: googleUser.email,
          full_name: googleUser.displayName || "Google User",
          google_id: googleUser.uid,
        });
        navigate("/dashboard");
      } catch (error) {
        sessionStorage.removeItem(GOOGLE_REDIRECT_FLAG);
        if (mounted) {
          toast.error(error?.message || "Google redirect sign-in failed");
        }
      }
    };

    consumeRedirectResult();
    return () => {
      mounted = false;
    };
  }, [googleLogin, navigate]);

  const submitForm = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      if (mode === "login") {
        await login({ email: formData.email, password: formData.password });
      } else {
        await register(formData);
      }
      navigate("/dashboard");
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Authentication failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = () => {
    const backendUrl = process.env.REACT_APP_BACKEND_URL || "";
    sessionStorage.setItem(GOOGLE_REDIRECT_FLAG, "1");
    window.location.href = `${backendUrl}/api/auth/google/start`;
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2" data-testid="auth-page">
      <section className="relative hidden lg:block" data-testid="auth-hero-section">
        <img src={heroImage} alt="Financial calm workspace" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-stone-900/30" />
        <div className="absolute bottom-12 left-12 max-w-md text-white">
          <p className="text-xs uppercase tracking-[0.25em]" data-testid="auth-hero-label">
            Trusted Cash Management
          </p>
          <h1 className="mt-3 text-4xl font-black leading-tight" data-testid="auth-hero-heading">
            Connect accounts, track every transaction, and export smart PDF financial reports.
          </h1>
        </div>
      </section>

      <section className="flex items-center justify-center bg-[#FDFBF7] p-6 md:p-10" data-testid="auth-form-section">
        <div className="w-full max-w-lg rounded-lg border border-stone-200 bg-white p-8 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500" data-testid="auth-form-label">
            Welcome to Financial Flow
          </p>
          <h2 className="mt-2 text-3xl font-black" data-testid="auth-form-heading">
            {mode === "login" ? "Sign in to your workspace" : "Create your account"}
          </h2>

          <div className="mt-6 grid grid-cols-2 gap-2 rounded-lg bg-stone-100 p-1" data-testid="auth-mode-toggle">
            <button
              type="button"
              data-testid="auth-mode-login-button"
              className={`rounded-md px-4 py-2 text-sm font-medium ${mode === "login" ? "bg-white" : "text-stone-600"}`}
              onClick={() => setMode("login")}
            >
              Login
            </button>
            <button
              type="button"
              data-testid="auth-mode-register-button"
              className={`rounded-md px-4 py-2 text-sm font-medium ${mode === "register" ? "bg-white" : "text-stone-600"}`}
              onClick={() => setMode("register")}
            >
              Register
            </button>
          </div>

          <form className="mt-6 space-y-4" onSubmit={submitForm} data-testid="auth-main-form">
            {mode === "register" && (
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="full_name">
                  Full name
                </label>
                <input
                  id="full_name"
                  required
                  data-testid="auth-full-name-input"
                  className="w-full rounded-md border border-stone-200 px-3 py-2"
                  value={formData.full_name}
                  onChange={(event) => setFormData((prev) => ({ ...prev, full_name: event.target.value }))}
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                data-testid="auth-email-input"
                className="w-full rounded-md border border-stone-200 px-3 py-2"
                value={formData.email}
                onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                data-testid="auth-password-input"
                className="w-full rounded-md border border-stone-200 px-3 py-2"
                value={formData.password}
                onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
              />
            </div>

            <button
              type="submit"
              data-testid="auth-submit-button"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-[#4A6741] px-5 py-3 text-sm font-medium text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#3D5636]"
            >
              {isSubmitting ? "Processing…" : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div className="mt-6 border-t border-stone-200 pt-5">
            <button
              type="button"
              data-testid="google-oauth-start-button"
              className="w-full rounded-lg border border-stone-200 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
              onClick={handleGoogleSignIn}
            >
              Continue with Google
            </button>
            <p className="mt-2 text-center text-xs text-stone-500" data-testid="google-oauth-status-text">
              Google sign-in is active for Financial Flow.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
