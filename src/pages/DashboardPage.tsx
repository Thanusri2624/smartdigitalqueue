import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Clock, FileText, Plus, QrCode, Ticket, Users, XCircle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

const priorityColors: Record<string, string> = {
  normal: "bg-primary/10 text-primary",
  senior: "bg-warning/10 text-warning",
  pregnant: "bg-priority-pregnant/10 text-priority-pregnant",
  disabled: "bg-priority-disabled/10 text-priority-disabled",
  emergency: "bg-destructive/10 text-destructive",
};

const statusColors: Record<string, string> = {
  waiting: "bg-warning/10 text-warning",
  serving: "bg-success/10 text-success",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-muted text-muted-foreground",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Tables<"queue_tickets">[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTickets = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("queue_tickets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    setTickets(data || []);
    setLoading(false);
  };

  const fetchDocuments = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("document_uploads")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    setDocuments(data || []);
  };

  useEffect(() => {
    fetchTickets();
    fetchDocuments();

    if (!user) return;
    const channel = supabase
      .channel("user-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_tickets", filter: `user_id=eq.${user.id}` }, fetchTickets)
      .on("postgres_changes", { event: "*", schema: "public", table: "document_uploads", filter: `user_id=eq.${user.id}` }, fetchDocuments)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const activeTickets = tickets.filter((t) => t.status === "waiting" || t.status === "serving");
  const pastTickets = tickets.filter((t) => t.status !== "waiting" && t.status !== "serving");

  const pendingDocs = documents.filter(d => d.status === "pending");
  const rejectedDocs = documents.filter(d => d.status === "rejected");
  const verifiedDocs = documents.filter(d => d.status === "verified");

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Manage your queue tickets & documents</p>
        </div>
        <Link to="/join-queue">
          <Button className="gradient-primary gap-2">
            <Plus className="h-4 w-4" />
            Join Queue
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Ticket className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{tickets.length}</p>
              <p className="text-xs text-muted-foreground">Total Tickets</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeTickets.length}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pastTickets.filter(t => t.status === 'completed').length}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{documents.length}</p>
              <p className="text-xs text-muted-foreground">Documents</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Document Verification Status */}
      {documents.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-display font-semibold mb-4">Document Status</h2>
          {pendingDocs.length > 0 && (
            <Card className="shadow-card border-0 mb-3">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-warning" />
                  <p className="font-medium text-sm text-warning">Pending Verification ({pendingDocs.length})</p>
                </div>
                <div className="space-y-1">
                  {pendingDocs.map(doc => (
                    <p key={doc.id} className="text-xs text-muted-foreground">• {doc.document_name}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {rejectedDocs.length > 0 && (
            <Card className="shadow-card border-0 border-l-4 border-l-destructive mb-3">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <p className="font-medium text-sm text-destructive">Rejected ({rejectedDocs.length})</p>
                </div>
                <div className="space-y-2">
                  {rejectedDocs.map(doc => (
                    <div key={doc.id}>
                      <p className="text-xs font-medium">{doc.document_name}</p>
                      {doc.notes && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {doc.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <Link to="/join-queue">
                  <Button size="sm" variant="outline" className="mt-3 gap-1">
                    <Plus className="h-3 w-3" /> Re-upload Documents
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
          {verifiedDocs.length > 0 && (
            <Card className="shadow-card border-0 mb-3">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <p className="font-medium text-sm text-success">Approved ({verifiedDocs.length})</p>
                </div>
                <div className="space-y-1">
                  {verifiedDocs.map(doc => (
                    <p key={doc.id} className="text-xs text-muted-foreground">• {doc.document_name}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Active Tickets */}
      {activeTickets.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-display font-semibold mb-4">Active Tickets</h2>
          <div className="space-y-3">
            {activeTickets.map((ticket) => (
              <Link key={ticket.id} to={`/ticket/${ticket.id}`}>
                <Card className="shadow-card border-0 hover:shadow-elevated transition-shadow cursor-pointer animate-slide-up">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg gradient-primary flex items-center justify-center">
                        <span className="text-primary-foreground font-display font-bold text-sm">{ticket.ticket_number}</span>
                      </div>
                      <div>
                        <p className="font-medium">{ticket.ticket_number}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className={priorityColors[ticket.priority]}>
                            {ticket.priority}
                          </Badge>
                          <Badge variant="outline" className={statusColors[ticket.status]}>
                            {ticket.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {ticket.estimated_wait_minutes != null && (
                        <p className="text-sm text-muted-foreground">
                          ~{ticket.estimated_wait_minutes} min wait
                        </p>
                      )}
                      {ticket.position != null && (
                        <p className="text-xs text-muted-foreground">Position: #{ticket.position}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Past Tickets */}
      {pastTickets.length > 0 && (
        <div>
          <h2 className="text-xl font-display font-semibold mb-4">History</h2>
          <div className="space-y-2">
            {pastTickets.map((ticket) => (
              <Link key={ticket.id} to={`/ticket/${ticket.id}`}>
                <Card className="shadow-card border-0 hover:shadow-elevated transition-shadow cursor-pointer opacity-80">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-medium">{ticket.ticket_number}</span>
                      <Badge variant="outline" className={statusColors[ticket.status]}>{ticket.status}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!loading && tickets.length === 0 && documents.length === 0 && (
        <Card className="shadow-card border-0">
          <CardContent className="p-12 text-center">
            <Ticket className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-display font-semibold mb-2">No tickets yet</h3>
            <p className="text-muted-foreground mb-4">Join a queue to get started</p>
            <Link to="/join-queue">
              <Button className="gradient-primary gap-2">
                <Plus className="h-4 w-4" />
                Join Queue
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
