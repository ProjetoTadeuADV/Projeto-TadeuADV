import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User
} from "firebase/auth";
import { ApiError, apiRequest } from "../lib/api";
import { auth } from "../lib/firebase";
import type { AuthAccessProfile } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isMasterUser: boolean;
  accessProfile: AuthAccessProfile | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string>;
  refreshUser: () => Promise<User | null>;
  refreshAccessProfile: () => Promise<AuthAccessProfile | null>;
  resendVerificationEmail: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessProfile, setAccessProfile] = useState<AuthAccessProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const getToken = useCallback(async () => {
    if (!auth.currentUser) {
      throw new Error("Usuário não autenticado.");
    }

    return auth.currentUser.getIdToken();
  }, []);

  const refreshAccessProfile = useCallback(async () => {
    if (!auth.currentUser) {
      setAccessProfile(null);
      return null;
    }

    try {
      const token = await auth.currentUser.getIdToken();
      const profile = await apiRequest<AuthAccessProfile>("/v1/auth/session", { token });
      setAccessProfile(profile);
      return profile;
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        setAccessProfile(null);
        return null;
      }

      throw error;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);

      if (!nextUser) {
        setAccessProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      void refreshAccessProfile()
        .catch(() => {
          setAccessProfile(null);
        })
        .finally(() => {
          setLoading(false);
        });
    });

    return unsubscribe;
  }, [refreshAccessProfile]);

  const login = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (name.trim()) {
      await updateProfile(result.user, { displayName: name.trim() });
    }

    try {
      await sendEmailVerification(result.user);
    } catch {
      // O fluxo continua simples: o usuário pode solicitar reenvio manualmente.
    }

    await reload(result.user);
    setUser(auth.currentUser);
    setAccessProfile(null);
  }, []);

  const logout = useCallback(async () => {
    setAccessProfile(null);
    await signOut(auth);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!auth.currentUser) {
      setUser(null);
      setAccessProfile(null);
      return null;
    }

    await reload(auth.currentUser);
    setUser(auth.currentUser);
    return auth.currentUser;
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) {
      throw new Error("Usuário não autenticado.");
    }

    await sendEmailVerification(auth.currentUser);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isMasterUser: accessProfile?.isMaster ?? false,
      accessProfile,
      login,
      register,
      logout,
      getToken,
      refreshUser,
      refreshAccessProfile,
      resendVerificationEmail
    }),
    [
      user,
      loading,
      accessProfile,
      login,
      register,
      logout,
      getToken,
      refreshUser,
      refreshAccessProfile,
      resendVerificationEmail
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }

  return context;
}
