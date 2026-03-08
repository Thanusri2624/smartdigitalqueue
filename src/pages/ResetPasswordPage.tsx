import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated successfully!");
      navigate("/dashboard");
    }
  };

  if (!isRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-elevated">
          <CardHeader className="text-center">
            <CardTitle>Invalid Link</CardTitle>
            <CardDescription>This password reset link is invalid or has expired.</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button onClick={() => navigate("/forgot-password")}>Request New Link</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-elevated animate-slide-up">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-xl gradient-primary flex items-center justify-center">
            <KeyRound className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-display">Set New Password</CardTitle>
          <CardDescription>Choose a secure password for your account</CardDescription>
        </CardHeader>
        <form onSubmit={handleReset}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full gradient-primary" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Password
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
