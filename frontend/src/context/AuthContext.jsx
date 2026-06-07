import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, authStorage } from "@/lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(authStorage.getUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      const token = authStorage.getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const response = await api.get("/auth/me");
        authStorage.setSession(token, response.data);
        setUser(response.data);
      } catch {
        authStorage.clearSession();
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, []);

  const completeTokenLogin = useCallback(async (token) => {
    authStorage.setSession(token, authStorage.getUser() || {});
    const response = await api.get("/auth/me");
    authStorage.setSession(token, response.data);
    setUser(response.data);
  }, []);

  const register = useCallback(async (payload) => {
    const response = await api.post("/auth/register", payload);
    authStorage.setSession(response.data.token, response.data.user);
    setUser(response.data.user);
    toast.success("Account created successfully");
  }, []);

  const login = useCallback(async (payload) => {
    const response = await api.post("/auth/login", payload);
    authStorage.setSession(response.data.token, response.data.user);
    setUser(response.data.user);
    toast.success("Welcome back");
  }, []);

  const googleLogin = useCallback(async (payload) => {
    const response = await api.post("/auth/google-login", payload);
    authStorage.setSession(response.data.token, response.data.user);
    setUser(response.data.user);
    toast.success("Signed in with Google");
  }, []);

  const logout = useCallback(() => {
    authStorage.clearSession();
    setUser(null);
    toast.success("Logged out");
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      register,
      login,
      googleLogin,
      logout,
      completeTokenLogin,
      isAuthenticated: Boolean(user),
    }),
    [user, loading, register, login, googleLogin, logout, completeTokenLogin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
};
