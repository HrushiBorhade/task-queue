"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";

export type AuthStep =
  | "enter-email"
  | "create-password"
  | "enter-password"
  | "check-email"
  | "oauth-user"
  | "forgot-password-sent";

interface AuthContextValue {
  step: AuthStep;
  setStep: (step: AuthStep) => void;
  goBack: () => void;
  email: string;
  setEmail: (value: string) => void;
  isNewUser: boolean;
  setIsNewUser: (value: boolean) => void;
  oauthProvider: string | null;
  setOauthProvider: (provider: string | null) => void;
  error: string | null;
  setError: (error: string | null) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [step, setStep] = useState<AuthStep>("enter-email");
  const [email, setEmail] = useState("");
  const [isNewUser, setIsNewUser] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const goBack = useCallback(() => {
    setStep("enter-email");
    setError(null);
    setIsNewUser(false);
    setOauthProvider(null);
  }, []);

  const value = useMemo(
    () => ({
      step,
      setStep,
      goBack,
      email,
      setEmail,
      isNewUser,
      setIsNewUser,
      oauthProvider,
      setOauthProvider,
      error,
      setError,
      loading,
      setLoading,
    }),
    [step, email, isNewUser, oauthProvider, error, loading, goBack],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
