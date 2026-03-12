"use client";

import { createContext, useContext, useReducer, useCallback, useMemo } from "react";

export type AuthStep =
  | "enter-email"
  | "create-password"
  | "enter-password"
  | "check-email"
  | "oauth-user"
  | "forgot-password-sent";

interface AuthState {
  step: AuthStep;
  email: string;
  isNewUser: boolean;
  oauthProvider: string | null;
  error: string | null;
  loading: boolean;
}

type AuthAction =
  | { type: "SET_STEP"; step: AuthStep }
  | { type: "SET_EMAIL"; email: string }
  | { type: "SET_IS_NEW_USER"; isNewUser: boolean }
  | { type: "SET_OAUTH_PROVIDER"; provider: string | null }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "GO_BACK" };

const initialState: AuthState = {
  step: "enter-email",
  email: "",
  isNewUser: false,
  oauthProvider: null,
  error: null,
  loading: false,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_EMAIL":
      return { ...state, email: action.email };
    case "SET_IS_NEW_USER":
      return { ...state, isNewUser: action.isNewUser };
    case "SET_OAUTH_PROVIDER":
      return { ...state, oauthProvider: action.provider };
    case "SET_ERROR":
      return { ...state, error: action.error };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "GO_BACK":
      return { ...state, step: "enter-email", error: null, isNewUser: false, oauthProvider: null };
    default:
      return state;
  }
}

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
  const [state, dispatch] = useReducer(authReducer, initialState);

  const setStep = useCallback((step: AuthStep) => dispatch({ type: "SET_STEP", step }), []);
  const setEmail = useCallback((email: string) => dispatch({ type: "SET_EMAIL", email }), []);
  const setIsNewUser = useCallback((isNewUser: boolean) => dispatch({ type: "SET_IS_NEW_USER", isNewUser }), []);
  const setOauthProvider = useCallback((provider: string | null) => dispatch({ type: "SET_OAUTH_PROVIDER", provider }), []);
  const setError = useCallback((error: string | null) => dispatch({ type: "SET_ERROR", error }), []);
  const setLoading = useCallback((loading: boolean) => dispatch({ type: "SET_LOADING", loading }), []);
  const goBack = useCallback(() => dispatch({ type: "GO_BACK" }), []);

  const value = useMemo(
    () => ({
      ...state,
      setStep,
      setEmail,
      setIsNewUser,
      setOauthProvider,
      setError,
      setLoading,
      goBack,
    }),
    [state, setStep, setEmail, setIsNewUser, setOauthProvider, setError, setLoading, goBack],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
