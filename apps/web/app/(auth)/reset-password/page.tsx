"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import { updatePassword } from "../login/actions";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login?error=reset_link_expired");
      } else {
        setSessionChecked(true);
      }
    });
  }, [router]);

  if (!sessionChecked) {
    return (
      <Card className="overflow-hidden p-0">
        <CardContent className="flex items-center justify-center p-6 md:p-8">
          <p className="text-xs text-muted-foreground">Verifying your reset link...</p>
        </CardContent>
      </Card>
    );
  }

  function handleSubmit() {
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await updatePassword(password);
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(true);
      }
    });
  }

  if (success) {
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
            {error && <FieldError>{error}</FieldError>}
            <Field>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input
                id="new-password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                disabled={isPending}
                autoFocus
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError(null);
                }}
                disabled={isPending}
                required
              />
            </Field>
            <Field>
              <Button type="submit" disabled={isPending || !password || !confirmPassword}>
                {isPending ? "Updating..." : "Reset password"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
