import { createContext, useContext, useEffect, useState } from "react";
import { api, setToken } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) { setLoading(false); return; }
    api.me().then(setUser).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { access_token } = await api.login({ email, password });
    setToken(access_token);
    const me = await api.me();
    setUser(me);
  };

  const signup = async (data) => {
    const { access_token } = await api.signup(data);
    setToken(access_token);
    const me = await api.me();
    setUser(me);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, signup, logout, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
