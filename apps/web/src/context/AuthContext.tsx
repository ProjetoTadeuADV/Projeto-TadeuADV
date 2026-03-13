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
  isOperatorUser: boolean;
  canAccessAdmin: boolean;
  canCreateCases: boolean;
  accessProfile: AuthAccessProfile | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: (forceRefresh?: boolean) => Promise<string>;
  refreshUser: () => Promise<User | null>;
  refreshAccessProfile: () => Promise<AuthAccessProfile | null>;
  resendVerificationEmail: () => Promise<void>;
  deleteCurrentAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface VerificationEmailDispatchResult {
  sent: boolean;
  reason?: string;
  provider?: string;
  message?: string;
}

function resolveVerificationDispatchError(result: VerificationEmailDispatchResult): string {
  if (result.message) {
    return result.message;
  }

  switch (result.reason) {
    case "custom-sender-not-configured":
      return "O envio de verificação por SendGrid ainda não foi configurado no servidor.";
    case "verification-link-failed":
      return "Não foi possível gerar o link de verificação no Firebase.";
    case "custom-send-failed":
      return "O SendGrid recusou o envio deste e-mail.";
    case "already-verified":
      return "Esta conta ja esta verificada.";
    default:
      return "Não foi possível reenviar agora. Tente novamente em instantes.";
  }
}

async function requestCustomVerificationEmail(
  currentUser: User
): Promise<VerificationEmailDispatchResult> {
  try {
    const token = await currentUser.getIdToken();
    const result = await apiRequest<VerificationEmailDispatchResult>("/v1/auth/verification-email", {
      method: "POST",
      token
    });
    return result;
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        sent: false,
        reason: "request-failed",
        message: error.message
      };
    }

    return {
      sent: false,
      reason: "request-failed"
    };
  }
}

async function requestVerificationEmailWithFallback(
  currentUser: User
): Promise<VerificationEmailDispatchResult> {
  const dispatch = await requestCustomVerificationEmail(currentUser);
  if (dispatch.sent || dispatch.reason === "already-verified") {
    return dispatch;
  }

  try {
    // Fallback para o template padrão do Firebase quando SendGrid/API falhar.
    await sendEmailVerification(currentUser);
    return {
      sent: true,
      provider: "firebase-client-fallback"
    };
  } catch (fallbackError) {
    console.warn("verification-email-fallback-failed", {
      dispatch,
      message: fallbackError instanceof Error ? fallbackError.message : "unknown"
    });
    return dispatch;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessProfile, setAccessProfile] = useState<AuthAccessProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const getToken = useCallback(async (forceRefresh = false) => {
    if (!auth.currentUser) {
      throw new Error("Usuário não autenticado.");
    }

    return auth.currentUser.getIdToken(forceRefresh);
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
    const normalizedName = name.trim();
    const normalizedEmail = email.trim();

    if (!normalizedName || !normalizedEmail || !password) {
      throw new Error("Todos os campos de cadastro são obrigatórios.");
    }

    const result = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    await updateProfile(result.user, { displayName: normalizedName });

    const dispatch = await requestVerificationEmailWithFallback(result.user);
    if (!dispatch.sent && dispatch.reason !== "already-verified") {
      console.warn("verification-email-dispatch-failed", dispatch);
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

    const dispatch = await requestVerificationEmailWithFallback(auth.currentUser);
    if (dispatch.sent || dispatch.reason === "already-verified") {
      return;
    }

    throw new Error(resolveVerificationDispatchError(dispatch));
  }, []);

  const deleteCurrentAccount = useCallback(async () => {
    if (!auth.currentUser) {
      throw new Error("Usuário não autenticado.");
    }

    const token = await auth.currentUser.getIdToken();
    await apiRequest<{ deletedUserId: string; deletedCases: number }>("/v1/users/me", {
      method: "DELETE",
      token
    });

    setAccessProfile(null);
    await signOut(auth);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isMasterUser: accessProfile?.isMaster ?? false,
      isOperatorUser: accessProfile?.isOperator ?? false,
      canAccessAdmin: accessProfile?.canAccessAdmin ?? false,
      canCreateCases: Boolean(user),
      accessProfile,
      login,
      register,
      logout,
      getToken,
      refreshUser,
      refreshAccessProfile,
      resendVerificationEmail,
      deleteCurrentAccount
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
      resendVerificationEmail,
      deleteCurrentAccount
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
