import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Check, CheckCheck } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Tables<"notifications">[]>([]);

  const fetch = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setNotifications(data || []);
  };

  useEffect(() => {
    fetch();
  }, [user]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    fetch();
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    fetch();
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Notifications</h1>
          <p className="text-muted-foreground">{unreadCount} unread</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" className="gap-2" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4" /> Mark All Read
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {notifications.map((n) => (
          <Card key={n.id} className={`shadow-card border-0 transition-all ${!n.is_read ? "bg-primary/5 border-l-4 border-l-primary" : ""}`}>
            <CardContent className="p-4 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${!n.is_read ? "gradient-primary" : "bg-muted"}`}>
                  <Bell className={`h-5 w-5 ${!n.is_read ? "text-primary-foreground" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <p className="font-medium text-sm">{n.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-2">{new Date(n.created_at).toLocaleString()}</p>
                </div>
              </div>
              {!n.is_read && (
                <Button variant="ghost" size="icon" onClick={() => markRead(n.id)}>
                  <Check className="h-4 w-4" />
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
        {notifications.length === 0 && (
          <Card className="shadow-card border-0">
            <CardContent className="p-12 text-center">
              <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No notifications yet</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
