import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function GoogleCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completeTokenLogin } = useAuth();

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      toast.error("Google login failed. Please try again.");
      navigate("/login");
      return;
    }

    completeTokenLogin(token)
      .then(() => {
        toast.success("Google login successful");
        navigate("/dashboard");
      })
      .catch(() => {
        toast.error("Google login failed. Please try again.");
        navigate("/login");
      });
  }, [searchParams, navigate, completeTokenLogin]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FDFBF7]" data-testid="google-callback-page">
      <p className="text-stone-600" data-testid="google-callback-status-text">Finalizing Google sign-in…</p>
    </div>
  );
}
