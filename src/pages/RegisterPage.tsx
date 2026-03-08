import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    dateOfBirth: "",
    isPregnant: false,
    isDisabled: false,
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName.trim() || !formData.email.trim() || !formData.password) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (formData.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: formData.email.trim(),
      password: formData.password,
      options: {
        data: { full_name: formData.fullName.trim() },
        emailRedirectTo: window.location.origin,
      },
    });
    
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    // Update profile with additional data
    if (data.user) {
      await supabase.from("profiles").update({
        phone: formData.phone || null,
        date_of_birth: formData.dateOfBirth || null,
        is_pregnant: formData.isPregnant,
        is_disabled: formData.isDisabled,
      }).eq("user_id", data.user.id);
    }

    setLoading(false);
    toast.success("Account created successfully! Please check your email to verify.");
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-elevated animate-slide-up">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-xl gradient-primary flex items-center justify-center">
            <UserPlus className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-display">Create Account</CardTitle>
          <CardDescription>Join Smart Queue to skip the wait</CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name *</Label>
              <Input id="fullName" name="fullName" placeholder="John Doe" value={formData.fullName} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" value={formData.email} onChange={handleChange} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input id="password" name="password" type="password" placeholder="••••••••" value={formData.password} onChange={handleChange} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm *</Label>
                <Input id="confirmPassword" name="confirmPassword" type="password" placeholder="••••••••" value={formData.confirmPassword} onChange={handleChange} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" type="tel" placeholder="+1234567890" value={formData.phone} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Date of Birth</Label>
                <Input id="dateOfBirth" name="dateOfBirth" type="date" value={formData.dateOfBirth} onChange={handleChange} />
              </div>
            </div>
            <div className="space-y-3 pt-2">
              <p className="text-sm font-medium text-muted-foreground">Priority Eligibility (optional)</p>
              <div className="flex items-center space-x-2">
                <Checkbox id="isPregnant" checked={formData.isPregnant} onCheckedChange={(v) => setFormData(p => ({ ...p, isPregnant: !!v }))} />
                <Label htmlFor="isPregnant" className="text-sm font-normal">I am pregnant</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="isDisabled" checked={formData.isDisabled} onCheckedChange={(v) => setFormData(p => ({ ...p, isDisabled: !!v }))} />
                <Label htmlFor="isDisabled" className="text-sm font-normal">I have a disability</Label>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full gradient-primary" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Account
            </Button>
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:underline font-medium">Sign in</Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
