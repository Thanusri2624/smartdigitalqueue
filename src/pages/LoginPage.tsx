import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Users, Shield, ClipboardList } from "lucide-react";

type RoleType = "citizen" | "staff" | "admin";

const roleConfig: Record<RoleType, { title: string; description: string; icon: typeof Users; color: string; redirect: string }> = {
  citizen: {
    title: "Citizen Sign In",
    description: "Access your queue tickets and bookings",
    icon: Users,
    color: "gradient-primary",
    redirect: "/dashboard",
  },
  staff: {
    title: "Staff Sign In",
    description: "Access the staff queue management panel",
    icon: ClipboardList,
    color: "bg-accent",
    redirect: "/staff",
  },
  admin: {
    title: "Admin Sign In",
    description: "Access the admin dashboard and analytics",
    icon: Shield,
    color: "bg-destructive",
    redirect: "/admin",
  },
};

export default function LoginPage({ role = "citizen" }: { role?: RoleType }) {
  const navigate = useNavigate();
  const { user, isAdmin, isStaff, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const config = roleConfig[role];
  const Icon = config.icon;

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && user) {
      if (isAdmin) navigate("/admin", { replace: true });
      else if (isStaff) navigate("/staff", { replace: true });
      else navigate("/dashboard", { replace: true });
    }
  }, [user, isAdmin, isStaff, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    // Verify the user has the correct role
    if (role !== "citizen" && data.user) {
      const requiredRole = role as "staff" | "admin";
      const { data: hasRole } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: requiredRole });
      
      if (!hasRole) {
        await supabase.auth.signOut();
        toast.error(`This account does not have ${role} access. Please use the correct login portal.`);
        setLoading(false);
        return;
      }
    }

    // For citizen login, make sure they're NOT staff/admin
    if (role === "citizen" && data.user) {
      const [adminRes, staffRes] = await Promise.all([
        supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" }),
        supabase.rpc("has_role", { _user_id: data.user.id, _role: "staff" }),
      ]);
      if (adminRes.data || staffRes.data) {
        await supabase.auth.signOut();
        toast.error("This account has staff/admin access. Please use the appropriate login portal.");
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    toast.success("Welcome back!");
    navigate(config.redirect);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-elevated animate-slide-up">
        <CardHeader className="text-center">
          <div className={`mx-auto mb-4 w-14 h-14 rounded-xl ${config.color} flex items-center justify-center`}>
            <Icon className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-display">{config.title}</CardTitle>
          <CardDescription>{config.description}</CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-sm text-primary hover:underline">Forgot password?</Link>
              </div>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className={`w-full ${config.color}`} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
            {role === "citizen" && (
              <p className="text-sm text-muted-foreground">
                Don't have an account?{" "}
                <Link to="/register" className="text-primary hover:underline font-medium">Sign up</Link>
              </p>
            )}
            {role !== "citizen" && (
              <p className="text-sm text-muted-foreground">
                Account created by admin. Contact your administrator if you need access.
              </p>
            )}
            <div className="w-full border-t pt-4">
              <p className="text-xs text-muted-foreground text-center mb-2">Other portals</p>
              <div className="flex gap-2 justify-center">
                {role !== "citizen" && <Link to="/login"><Button variant="outline" size="sm">Citizen</Button></Link>}
                {role !== "staff" && <Link to="/login/staff"><Button variant="outline" size="sm">Staff</Button></Link>}
                {role !== "admin" && <Link to="/login/admin"><Button variant="outline" size="sm">Admin</Button></Link>}
              </div>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
