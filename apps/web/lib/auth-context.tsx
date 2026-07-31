"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex";

export interface AuthUser {
  _id: string;
  name: string;
  email: string;
  isSuperadmin: boolean;
}

/**
 * Solo guardamos el token de sesión. Antes se guardaba el objeto de usuario
 * completo, que era editable desde la consola del navegador: cambiar
 * `isSuperadmin` a true en localStorage bastaba para que la interfaz mostrara
 * el panel de superadmin. Ahora la identidad la resuelve el servidor a partir
 * del token, y el frontend solo refleja lo que el servidor responde.
 */
const TOKEN_KEY = "mezzi_session_token";
/** Clave del esquema anterior. Se limpia al arrancar para no dejar restos. */
const LEGACY_USER_KEY = "restaurantes_saas_user";

interface AuthContextValue {
  user: AuthUser | null;
  /** Token de sesión. Se pasa a las funciones del backend que lo exigen. */
  token: string | null;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  /** Falso hasta que leemos localStorage: evita parpadeos y redirecciones. */
  const [hydrated, setHydrated] = useState(false);

  const logoutMutation = useMutation(api.auth.logout);

  useEffect(() => {
    setTokenState(loadToken());
    try {
      localStorage.removeItem(LEGACY_USER_KEY);
    } catch {
      /* localStorage no disponible */
    }
    setHydrated(true);
  }, []);

  const me = useQuery(api.auth.me, token ? { token } : "skip");

  // El servidor rechazó el token (expirado o revocado): descartarlo.
  useEffect(() => {
    if (token && me === null) {
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch {
        /* localStorage no disponible */
      }
      setTokenState(null);
    }
  }, [token, me]);

  const login = useCallback((newToken: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, newToken);
    } catch {
      /* localStorage no disponible */
    }
    setTokenState(newToken);
  }, []);

  const logout = useCallback(() => {
    const current = token;
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* localStorage no disponible */
    }
    setTokenState(null);
    // Invalida la sesión también en el servidor; si falla, el token local ya
    // se borró, así que la sesión queda inutilizable desde este navegador.
    if (current) void logoutMutation({ token: current }).catch(() => {});
  }, [token, logoutMutation]);

  const user: AuthUser | null = me
    ? {
        _id: me._id,
        name: me.name,
        email: me.email,
        isSuperadmin: me.isSuperadmin,
      }
    : null;

  // Cargando mientras no hayamos leído localStorage, o mientras haya un token
  // cuya validación sigue en vuelo.
  const isLoading = !hydrated || (token !== null && me === undefined);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
