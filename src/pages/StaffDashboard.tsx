import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckCircle, FileCheck, PhoneCall, QrCode, Users, XCircle } from "lucide-react";
import QrScanner from "@/components/staff/QrScanner";
import type { Tables } from "@/integrations/supabase/types";

const statusColors: Record<string, string> = {
  waiting: "bg-warning/10 text-warning",
  serving: "bg-success/10 text-success",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-muted text-muted-foreground",
};

const priorityOrder: Record<string, number> = {
  emergency: 0, senior: 1, pregnant: 1, disabled: 1, normal: 2,
};

export default function StaffDashboard() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Tables<"queue_tickets">[]>([]);
  const [services, setServices] = useState<Tables<"services">[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);

  const fetchAll = async () => {
    const [t, s] = await Promise.all([
      supabase.from("queue_tickets").select("*").in("status", ["waiting", "serving"]).order("created_at"),
      supabase.from("services").select("*"),
    ]);
    setTickets(t.data || []);
    setServices(s.data || []);
  };

  const fetchDocuments = async () => {
    const { data } = await supabase
      .from("document_uploads")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    setDocuments(data || []);
  };

  useEffect(() => {
    fetchAll();
    fetchDocuments();
    const channel = supabase
      .channel("staff-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_tickets" }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const callNext = async () => {
    const waiting = tickets.filter(t => t.status === "waiting");
    if (waiting.length === 0) { toast.info("No tickets waiting"); return; }
    const sorted = waiting.sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 2;
      const pb = priorityOrder[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    const next = sorted[0];
    const { error } = await supabase.from("queue_tickets").update({
      status: "serving",
      called_at: new Date().toISOString(),
    }).eq("id", next.id);
    if (error) { toast.error(error.message); return; }

    // Notify user and log
    if (next.user_id) {
      await supabase.from("notifications").insert({
        user_id: next.user_id,
        title: "It's Your Turn!",
        message: `Your ticket ${next.ticket_number} is now being called. Please proceed to the counter.`,
        ticket_id: next.id,
      });
    }
    if (user) {
      await supabase.from("staff_activity_logs").insert({
        staff_id: user.id,
        action: "called",
        ticket_id: next.id,
        details: { ticket_number: next.ticket_number, message: `Called ticket ${next.ticket_number}` },
      });
    }
    toast.success(`Called ticket ${next.ticket_number}`);
  };

  const updateTicketStatus = async (ticketId: string, ticketNumber: string, status: string) => {
    const updateData: Record<string, any> = { status };
    if (status === "completed") updateData.completed_at = new Date().toISOString();

    const { error } = await supabase.from("queue_tickets").update(updateData).eq("id", ticketId);
    if (error) { toast.error(error.message); return; }

    if (user) {
      await supabase.from("staff_activity_logs").insert({
        staff_id: user.id,
        action: status,
        ticket_id: ticketId,
        details: { ticket_number: ticketNumber, message: `${status} ticket ${ticketNumber}` },
      });
    }
    toast.success(`Ticket ${ticketNumber} → ${status}`);
  };

  const verifyDocument = async (docId: string, status: "verified" | "rejected") => {
    const { error } = await supabase.from("document_uploads").update({
      status,
      verified_by: user?.id,
      updated_at: new Date().toISOString(),
    }).eq("id", docId);
    if (error) toast.error(error.message);
    else { toast.success(`Document ${status}`); fetchDocuments(); }

    if (user) {
      await supabase.from("staff_activity_logs").insert({
        staff_id: user.id,
        action: "verified_document",
        details: { message: `Document ${status}`, document_id: docId },
      });
    }
  };

  const waitingTickets = tickets.filter(t => t.status === "waiting");
  const servingTickets = tickets.filter(t => t.status === "serving");

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Staff Dashboard</h1>
          <p className="text-muted-foreground">Manage queue, scan QR codes, verify documents</p>
        </div>
        <Button className="gradient-primary gap-2" onClick={callNext}>
          <PhoneCall className="h-4 w-4" /> Call Next
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{waitingTickets.length}</p>
              <p className="text-xs text-muted-foreground">Waiting</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{servingTickets.length}</p>
              <p className="text-xs text-muted-foreground">Serving</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{documents.length}</p>
              <p className="text-xs text-muted-foreground">Pending Docs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="scanner"><QrCode className="h-4 w-4 mr-1" />QR Scanner</TabsTrigger>
          <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-2">
          {tickets.map((ticket) => {
            const svc = services.find(s => s.id === ticket.service_id);
            return (
              <Card key={ticket.id} className="shadow-card border-0">
                <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
                      <span className="text-primary-foreground font-display font-bold text-xs">{ticket.ticket_number}</span>
                    </div>
                    <div>
                      <p className="font-medium text-sm">{ticket.ticket_number}</p>
                      <p className="text-xs text-muted-foreground">{svc?.name || "—"}</p>
                    </div>
                    <Badge variant="outline" className={statusColors[ticket.status]}>{ticket.status}</Badge>
                    <Badge variant="outline">{ticket.priority}</Badge>
                  </div>
                  <div className="flex gap-2">
                    {ticket.status === "waiting" && (
                      <Button size="sm" variant="outline" className="gap-1 text-success" onClick={() => updateTicketStatus(ticket.id, ticket.ticket_number, "serving")}>
                        <PhoneCall className="h-3 w-3" /> Call
                      </Button>
                    )}
                    {ticket.status === "serving" && (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => updateTicketStatus(ticket.id, ticket.ticket_number, "completed")}>
                        <CheckCircle className="h-3 w-3" /> Complete
                      </Button>
                    )}
                    {(ticket.status === "waiting" || ticket.status === "serving") && (
                      <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => updateTicketStatus(ticket.id, ticket.ticket_number, "cancelled")}>
                        <XCircle className="h-3 w-3" /> Cancel
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {tickets.length === 0 && <p className="text-center text-muted-foreground py-8">No active tickets</p>}
        </TabsContent>

        <TabsContent value="scanner">
          <QrScanner />
        </TabsContent>

        <TabsContent value="documents" className="space-y-2">
          {documents.map((doc) => (
            <Card key={doc.id} className="shadow-card border-0">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{doc.document_name}</p>
                  <p className="text-xs text-muted-foreground">Uploaded {new Date(doc.created_at).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1 text-success" onClick={() => verifyDocument(doc.id, "verified")}>
                    <CheckCircle className="h-3 w-3" /> Verify
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => verifyDocument(doc.id, "rejected")}>
                    <XCircle className="h-3 w-3" /> Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {documents.length === 0 && <p className="text-center text-muted-foreground py-8">No pending documents</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
