import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

export default function ProfilePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({
    full_name: "",
    phone: "",
    date_of_birth: "",
    is_pregnant: false,
    is_disabled: false,
  });

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("user_id", user.id).single().then(({ data }) => {
      if (data) {
        setProfile({
          full_name: data.full_name || "",
          phone: data.phone || "",
          date_of_birth: data.date_of_birth || "",
          is_pregnant: data.is_pregnant,
          is_disabled: data.is_disabled,
        });
      }
    });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("profiles").update({
      full_name: profile.full_name,
      phone: profile.phone || null,
      date_of_birth: profile.date_of_birth || null,
      is_pregnant: profile.is_pregnant,
      is_disabled: profile.is_disabled,
    }).eq("user_id", user.id);
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Profile updated!");
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-lg">
      <h1 className="text-3xl font-display font-bold mb-8">Profile</h1>
      <Card className="shadow-elevated border-0">
        <CardHeader>
          <CardTitle className="font-display">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email || ""} disabled />
          </div>
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input value={profile.full_name} onChange={(e) => setProfile(p => ({ ...p, full_name: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input type="tel" value={profile.phone} onChange={(e) => setProfile(p => ({ ...p, phone: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Date of Birth</Label>
            <Input type="date" value={profile.date_of_birth} onChange={(e) => setProfile(p => ({ ...p, date_of_birth: e.target.value }))} />
          </div>
          <div className="space-y-3 pt-2">
            <p className="text-sm font-medium text-muted-foreground">Priority Eligibility</p>
            <div className="flex items-center space-x-2">
              <Checkbox id="pregnant" checked={profile.is_pregnant} onCheckedChange={(v) => setProfile(p => ({ ...p, is_pregnant: !!v }))} />
              <Label htmlFor="pregnant" className="font-normal">I am pregnant</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="disabled" checked={profile.is_disabled} onCheckedChange={(v) => setProfile(p => ({ ...p, is_disabled: !!v }))} />
              <Label htmlFor="disabled" className="font-normal">I have a disability</Label>
            </div>
          </div>
          <Button onClick={handleSave} className="w-full gradient-primary gap-2" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
