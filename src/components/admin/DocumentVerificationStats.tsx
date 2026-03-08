import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, FileText, XCircle } from "lucide-react";

export default function DocumentVerificationStats() {
  const [stats, setStats] = useState({ pending: 0, verified: 0, rejected: 0 });
  const [slotStats, setSlotStats] = useState({ total: 0, booked: 0 });
  const [recentDocs, setRecentDocs] = useState<any[]>([]);

  const fetchStats = async () => {
    const [pending, verified, rejected] = await Promise.all([
      supabase.from("document_uploads").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("document_uploads").select("*", { count: "exact", head: true }).eq("status", "verified"),
      supabase.from("document_uploads").select("*", { count: "exact", head: true }).eq("status", "rejected"),
    ]);
    setStats({
      pending: pending.count || 0,
      verified: verified.count || 0,
      rejected: rejected.count || 0,
    });

    const { count: totalSlots } = await supabase.from("service_slots").select("*", { count: "exact", head: true }).eq("is_active", true);
    const { count: bookedSlots } = await supabase.from("slot_bookings").select("*", { count: "exact", head: true }).eq("status", "booked");
    setSlotStats({ total: totalSlots || 0, booked: bookedSlots || 0 });

    const { data: docs } = await supabase
      .from("document_uploads")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(10);
    setRecentDocs(docs || []);
  };

  useEffect(() => {
    fetchStats();
    const channel = supabase
      .channel("admin-doc-stats")
      .on("postgres_changes", { event: "*", schema: "public", table: "document_uploads" }, fetchStats)
      .on("postgres_changes", { event: "*", schema: "public", table: "slot_bookings" }, fetchStats)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const statusBadge = (status: string) => {
    if (status === "verified") return <Badge className="bg-success/10 text-success text-xs">Approved</Badge>;
    if (status === "rejected") return <Badge className="bg-destructive/10 text-destructive text-xs">Rejected</Badge>;
    return <Badge className="bg-warning/10 text-warning text-xs">Pending</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.pending}</p>
              <p className="text-xs text-muted-foreground">Pending Verifications</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.verified}</p>
              <p className="text-xs text-muted-foreground">Approved</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.rejected}</p>
              <p className="text-xs text-muted-foreground">Rejected</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{slotStats.booked}/{slotStats.total}</p>
              <p className="text-xs text-muted-foreground">Slots Booked</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Documents */}
      <Card className="shadow-card border-0">
        <CardHeader>
          <CardTitle className="font-display text-lg">Recent Document Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentDocs.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
              <div>
                <p className="text-sm font-medium">{doc.document_name}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(doc.updated_at).toLocaleString()}
                </p>
                {doc.notes && doc.status === "rejected" && (
                  <p className="text-xs text-destructive mt-1">Reason: {doc.notes}</p>
                )}
              </div>
              {statusBadge(doc.status)}
            </div>
          ))}
          {recentDocs.length === 0 && (
            <p className="text-center text-muted-foreground py-4">No document activity yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
