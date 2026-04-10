import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, authStorage } from "@/lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(authStorage.getUser());
  const [loading, setLoading] = useState(true);

  const completeTokenLogin = async (token) => {
    authStorage.setSession(token, authStorage.getUser() || {});
    const response = await api.get("/auth/me");
    authStorage.setSession(token, response.data);
    setUser(response.data);
  };

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

  const register = async (payload) => {
    const response = await api.post("/auth/register", payload);
    authStorage.setSession(response.data.token, response.data.user);
    setUser(response.data.user);
    toast.success("Account created successfully");
  };

  const login = async (payload) => {
    const response = await api.post("/auth/login", payload);
    authStorage.setSession(response.data.token, response.data.user);
    setUser(response.data.user);
    toast.success("Welcome back");
  };

  const logout = () => {
    authStorage.clearSession();
    setUser(null);
    toast.success("Logged out");
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      register,
      login,
      logout,
      completeTokenLogin,
      isAuthenticated: Boolean(user),
    }),
    [user, loading],
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
