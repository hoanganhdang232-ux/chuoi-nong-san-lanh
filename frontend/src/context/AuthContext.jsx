import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("agritrace_user");
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState(() =>
    localStorage.getItem("agritrace_token"),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .getMe()
      .then(({ user: currentUser }) => {
        setUser(currentUser);
        localStorage.setItem("agritrace_user", JSON.stringify(currentUser));
      })
      .catch(() => {
        localStorage.removeItem("agritrace_token");
        localStorage.removeItem("agritrace_user");
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const result = await api.login(email, password);
    localStorage.setItem("agritrace_token", result.token);
    localStorage.setItem("agritrace_user", JSON.stringify(result.user));
    setToken(result.token);
    setUser(result.user);
    return result;
  };

  const logout = () => {
    localStorage.removeItem("agritrace_token");
    localStorage.removeItem("agritrace_user");
    setToken(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, token, loading, login, logout }),
    [user, token, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
