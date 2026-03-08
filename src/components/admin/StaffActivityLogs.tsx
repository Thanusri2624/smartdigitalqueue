import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Activity, Clock } from "lucide-react";

export default function StaffActivityLogs() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("staff_activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setLogs(data || []);
    };
    fetch();

    const channel = supabase
      .channel("admin-staff-logs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "staff_activity_logs" }, fetch)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const actionColors: Record<string, string> = {
    called: "bg-warning/10 text-warning",
    completed: "bg-success/10 text-success",
    cancelled: "bg-destructive/10 text-destructive",
    verified_document: "bg-primary/10 text-primary",
    scanned_qr: "bg-primary/10 text-primary",
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-display font-semibold">Staff Activity</h2>
      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {logs.map((log) => (
          <Card key={log.id} className="shadow-card border-0">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                <Activity className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={actionColors[log.action] || ""}>{log.action}</Badge>
                  {log.details?.ticket_number && (
                    <span className="text-xs font-mono text-muted-foreground">{log.details.ticket_number}</span>
                  )}
                </div>
                {log.details?.message && <p className="text-xs text-muted-foreground mt-0.5">{log.details.message}</p>}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {format(new Date(log.created_at), "HH:mm")}
              </div>
            </CardContent>
          </Card>
        ))}
        {logs.length === 0 && <p className="text-muted-foreground text-center py-8">No activity yet.</p>}
      </div>
    </div>
  );
}
