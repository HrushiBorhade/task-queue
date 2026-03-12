"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";

export type AuthStep =
  | "enter-email-or-phone"
  | "create-password"
  | "enter-password"
  | "verify-otp"
  | "check-email"
  | "oauth-user"
  | "forgot-password-sent";

type InputType = "email" | "phone";

interface AuthContextValue {
  step: AuthStep;
  setStep: (step: AuthStep) => void;
  goBack: () => void;
  emailOrPhone: string;
  setEmailOrPhone: (value: string) => void;
  inputType: InputType;
  setInputType: (type: InputType) => void;
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
  const [step, setStep] = useState<AuthStep>("enter-email-or-phone");
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [inputType, setInputType] = useState<InputType>("email");
  const [isNewUser, setIsNewUser] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const goBack = useCallback(() => {
    setStep("enter-email-or-phone");
    setError(null);
    setIsNewUser(false);
    setOauthProvider(null);
  }, []);

  const value = useMemo(
    () => ({
      step,
      setStep,
      goBack,
      emailOrPhone,
      setEmailOrPhone,
      inputType,
      setInputType,
      isNewUser,
      setIsNewUser,
      oauthProvider,
      setOauthProvider,
      error,
      setError,
      loading,
      setLoading,
    }),
    [step, emailOrPhone, inputType, isNewUser, oauthProvider, error, loading, goBack],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
