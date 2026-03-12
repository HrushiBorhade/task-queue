"use client";

import { useReducer, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import { updatePassword } from "../login/actions";

interface ResetState {
  password: string;
  confirmPassword: string;
  error: string | null;
  success: boolean;
  sessionChecked: boolean;
}

type ResetAction =
  | { type: "SET_PASSWORD"; value: string }
  | { type: "SET_CONFIRM_PASSWORD"; value: string }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_SUCCESS" }
  | { type: "SESSION_CHECKED" };

function resetReducer(state: ResetState, action: ResetAction): ResetState {
  switch (action.type) {
    case "SET_PASSWORD":
      return { ...state, password: action.value, error: null };
    case "SET_CONFIRM_PASSWORD":
      return { ...state, confirmPassword: action.value, error: null };
    case "SET_ERROR":
      return { ...state, error: action.error };
    case "SET_SUCCESS":
      return { ...state, success: true };
    case "SESSION_CHECKED":
      return { ...state, sessionChecked: true };
    default:
      return state;
  }
}

const initialState: ResetState = {
  password: "",
  confirmPassword: "",
  error: null,
  success: false,
  sessionChecked: false,
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const [state, dispatch] = useReducer(resetReducer, initialState);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login?error=reset_link_expired");
      } else {
        dispatch({ type: "SESSION_CHECKED" });
      }
    });
  }, [router]);

  if (!state.sessionChecked) {
    return (
      <Card className="overflow-hidden p-0">
        <CardContent className="flex items-center justify-center p-6 md:p-8">
          <p className="text-xs text-muted-foreground">Verifying your reset link...</p>
        </CardContent>
      </Card>
    );
  }

  function handleSubmit() {
    if (state.password.length < 6) {
      dispatch({ type: "SET_ERROR", error: "Password must be at least 6 characters" });
      return;
    }
    if (state.password !== state.confirmPassword) {
      dispatch({ type: "SET_ERROR", error: "Passwords do not match" });
      return;
    }

    startTransition(async () => {
      dispatch({ type: "SET_ERROR", error: null });
      const result = await updatePassword(state.password);
      if (result?.error) {
        dispatch({ type: "SET_ERROR", error: result.error });
      } else {
        dispatch({ type: "SET_SUCCESS" });
      }
    });
  }

  if (state.success) {
    return (
      <Card className="overflow-hidden p-0">
        <CardContent className="p-6 md:p-8">
          <FieldGroup>
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-2xl font-bold">Password reset</h1>
              <p className="text-sm text-balance text-muted-foreground">
                Your password has been updated. You can now sign in.
              </p>
            </div>
            <Field>
              <Button onClick={() => router.push("/login")}>
                Go to sign in
              </Button>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-6 md:p-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <FieldGroup>
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-2xl font-bold">Reset password</h1>
              <p className="text-sm text-balance text-muted-foreground">
                Create a new password for your account
              </p>
            </div>
            {state.error && <FieldError>{state.error}</FieldError>}
            <Field>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input
                id="new-password"
                type="password"
                placeholder="At least 6 characters"
                value={state.password}
                onChange={(e) => dispatch({ type: "SET_PASSWORD", value: e.target.value })}
                disabled={isPending}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
              <Input
                id="confirm-password"
                type="password"
                value={state.confirmPassword}
                onChange={(e) => dispatch({ type: "SET_CONFIRM_PASSWORD", value: e.target.value })}
                disabled={isPending}
                required
              />
            </Field>
            <Field>
              <Button type="submit" disabled={isPending || !state.password || !state.confirmPassword}>
                {isPending ? "Updating..." : "Reset password"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
