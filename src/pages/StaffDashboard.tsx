import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  CheckCircle,
  Clock,
  Eye,
  FileCheck,
  FileText,
  Loader2,
  Phone,
  PhoneCall,
  PlayCircle,
  QrCode,
  User,
  Users,
  XCircle,
} from "lucide-react";
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

interface NextTicketDetails {
  ticket: Tables<"queue_tickets">;
  serviceName: string;
  serviceDescription: string;
  userName: string;
  userPhone: string | null;
  userDob: string | null;
  isPregnant: boolean;
  isDisabled: boolean;
  documents: { id: string; document_name: string; status: string }[];
}

export default function StaffDashboard() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Tables<"queue_tickets">[]>([]);
  const [services, setServices] = useState<Tables<"services">[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingDocId, setRejectingDocId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);

  // Next ticket details for review before serving
  const [nextTicket, setNextTicket] = useState<NextTicketDetails | null>(null);
  const [loadingNext, setLoadingNext] = useState(false);
  const [startingService, setStartingService] = useState(false);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "document_uploads" }, fetchDocuments)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const getNextWaiting = () => {
    const waiting = tickets.filter(t => t.status === "waiting");
    if (waiting.length === 0) return null;
    const sorted = [...waiting].sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 2;
      const pb = priorityOrder[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    return sorted[0];
  };

  const callNext = async () => {
    const next = getNextWaiting();
    if (!next) { toast.info("No tickets waiting"); return; }

    setLoadingNext(true);

    // Fetch service info
    const svc = services.find(s => s.id === next.service_id);

    // Fetch user profile
    let userName = "—";
    let userPhone: string | null = null;
    let userDob: string | null = null;
    let isPregnant = false;
    let isDisabled = false;
    if (next.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone, date_of_birth, is_pregnant, is_disabled")
        .eq("user_id", next.user_id)
        .single();
      if (profile) {
        userName = profile.full_name || "—";
        userPhone = profile.phone;
        userDob = profile.date_of_birth;
        isPregnant = profile.is_pregnant;
        isDisabled = profile.is_disabled;
      }
    }

    // Fetch documents for this service
    let docs: { id: string; document_name: string; status: string }[] = [];
    if (next.user_id) {
      const { data: d } = await supabase
        .from("document_uploads")
        .select("id, document_name, status")
        .eq("user_id", next.user_id)
        .eq("service_id", next.service_id);
      docs = d || [];
    }

    setNextTicket({
      ticket: next,
      serviceName: svc?.name || "—",
      serviceDescription: svc?.description || "",
      userName,
      userPhone,
      userDob,
      isPregnant,
      isDisabled,
      documents: docs,
    });

    setLoadingNext(false);
  };

  const startServing = async () => {
    if (!nextTicket || !user) return;
    setStartingService(true);

    const { error } = await supabase.from("queue_tickets").update({
      status: "serving",
      called_at: new Date().toISOString(),
    }).eq("id", nextTicket.ticket.id);

    if (error) { toast.error(error.message); setStartingService(false); return; }

    if (nextTicket.ticket.user_id) {
      await supabase.from("notifications").insert({
        user_id: nextTicket.ticket.user_id,
        title: "It's Your Turn!",
        message: `Your ticket ${nextTicket.ticket.ticket_number} is now being served. Please proceed to the counter.`,
        ticket_id: nextTicket.ticket.id,
      });
    }

    await supabase.from("staff_activity_logs").insert({
      staff_id: user.id,
      action: "started_serving",
      ticket_id: nextTicket.ticket.id,
      details: { ticket_number: nextTicket.ticket.ticket_number, message: `Started serving ${nextTicket.ticket.ticket_number}` },
    });

    toast.success(`Now serving ${nextTicket.ticket.ticket_number}`);
    setNextTicket(prev => prev ? { ...prev, ticket: { ...prev.ticket, status: "serving" as any } } : null);
    setStartingService(false);
  };

  const markCompleted = async () => {
    if (!nextTicket || !user) return;
    const { error } = await supabase.from("queue_tickets").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", nextTicket.ticket.id);

    if (error) { toast.error(error.message); return; }

    await supabase.from("staff_activity_logs").insert({
      staff_id: user.id,
      action: "completed",
      ticket_id: nextTicket.ticket.id,
      details: { ticket_number: nextTicket.ticket.ticket_number, message: `Completed ${nextTicket.ticket.ticket_number}` },
    });

    toast.success(`${nextTicket.ticket.ticket_number} completed`);
    setNextTicket(null);
  };

  const skipTicket = async () => {
    if (!nextTicket || !user) return;
    const { error } = await supabase.from("queue_tickets").update({
      status: "no_show",
    }).eq("id", nextTicket.ticket.id);

    if (error) { toast.error(error.message); return; }

    await supabase.from("staff_activity_logs").insert({
      staff_id: user.id,
      action: "no_show",
      ticket_id: nextTicket.ticket.id,
      details: { ticket_number: nextTicket.ticket.ticket_number, message: `Marked ${nextTicket.ticket.ticket_number} as no-show` },
    });

    toast.info(`${nextTicket.ticket.ticket_number} marked as no-show`);
    setNextTicket(null);
  };

  const viewDocument = async (filePath: string) => {
    const { data } = await supabase.storage.from("documents").createSignedUrl(filePath, 300);
    if (data?.signedUrl) {
      setPreviewUrl(data.signedUrl);
      setPreviewDialogOpen(true);
    } else {
      toast.error("Could not load document preview");
    }
  };

  const verifyDocument = async (docId: string) => {
    const { error } = await supabase.from("document_uploads").update({
      status: "verified",
      verified_by: user?.id,
      updated_at: new Date().toISOString(),
    }).eq("id", docId);
    if (error) toast.error(error.message);
    else { toast.success("Document approved"); fetchDocuments(); }

    if (user) {
      await supabase.from("staff_activity_logs").insert({
        staff_id: user.id,
        action: "verified_document",
        details: { message: "Document verified", document_id: docId },
      });
    }
  };

  const openRejectDialog = (docId: string) => {
    setRejectingDocId(docId);
    setRejectReason("");
    setRejectDialogOpen(true);
  };

  const confirmReject = async () => {
    if (!rejectingDocId) return;
    if (!rejectReason.trim()) { toast.error("Please provide a reason for rejection"); return; }

    const { error } = await supabase.from("document_uploads").update({
      status: "rejected",
      notes: rejectReason.trim(),
      verified_by: user?.id,
      updated_at: new Date().toISOString(),
    }).eq("id", rejectingDocId);

    if (error) toast.error(error.message);
    else { toast.success("Document rejected with reason"); fetchDocuments(); }

    if (user) {
      await supabase.from("staff_activity_logs").insert({
        staff_id: user.id,
        action: "rejected_document",
        details: { message: `Document rejected: ${rejectReason.trim()}`, document_id: rejectingDocId },
      });
    }

    setRejectDialogOpen(false);
    setRejectingDocId(null);
    setRejectReason("");
  };

  const waitingTickets = tickets.filter(t => t.status === "waiting");
  const servingTickets = tickets.filter(t => t.status === "serving");

  const docStatusColors: Record<string, string> = {
    pending: "bg-warning/10 text-warning",
    verified: "bg-success/10 text-success",
    rejected: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold">Staff Dashboard</h1>
          <p className="text-muted-foreground">Manage queue in order, verify documents</p>
        </div>
        <Button className="gradient-primary gap-2" onClick={callNext} disabled={loadingNext}>
          {loadingNext ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
          Call Next
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

      {/* Next Ticket Review Panel */}
      {nextTicket && (
        <Card className="shadow-elevated border-0 mb-8 animate-slide-up border-l-4 border-l-primary">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="font-display text-lg">
                {nextTicket.ticket.status === "serving" ? "Currently Serving" : "Next in Queue — Review Details"}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setNextTicket(null)} className="text-muted-foreground">
                Dismiss
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Ticket Info */}
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl gradient-primary flex items-center justify-center">
                <span className="text-primary-foreground font-display font-bold text-sm">{nextTicket.ticket.ticket_number}</span>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-lg">{nextTicket.ticket.ticket_number}</p>
                <div className="flex gap-2 mt-1">
                  <Badge variant="outline" className={statusColors[nextTicket.ticket.status]}>{nextTicket.ticket.status}</Badge>
                  <Badge variant="outline">{nextTicket.ticket.priority}</Badge>
                </div>
              </div>
            </div>

            <Separator />

            {/* Reason for visit */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reason for Visit</p>
              <p className="font-semibold text-base">{nextTicket.serviceName}</p>
              {nextTicket.serviceDescription && (
                <p className="text-sm text-muted-foreground">{nextTicket.serviceDescription}</p>
              )}
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Clock className="h-3 w-3" />
                Est. {nextTicket.ticket.estimated_wait_minutes ?? "—"} min • Joined {new Date(nextTicket.ticket.created_at).toLocaleTimeString()}
              </div>
            </div>

            <Separator />

            {/* User Info */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">User Information</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{nextTicket.userName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{nextTicket.userPhone || "Not provided"}</span>
                </div>
                {nextTicket.userDob && (
                  <div className="col-span-2 text-muted-foreground">
                    DOB: {new Date(nextTicket.userDob).toLocaleDateString()}
                  </div>
                )}
                {(nextTicket.isPregnant || nextTicket.isDisabled) && (
                  <div className="col-span-2 flex gap-2">
                    {nextTicket.isPregnant && <Badge variant="outline" className="bg-accent/50">Pregnant</Badge>}
                    {nextTicket.isDisabled && <Badge variant="outline" className="bg-accent/50">Disabled</Badge>}
                  </div>
                )}
              </div>
            </div>

            {/* Documents */}
            {nextTicket.documents.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Documents</p>
                  {nextTicket.documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between text-sm py-1">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span>{doc.document_name}</span>
                      </div>
                      <Badge variant="outline" className={docStatusColors[doc.status] || ""}>
                        {doc.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </>
            )}

            <Separator />

            {/* Action Buttons */}
            {nextTicket.ticket.status === "waiting" && (
              <div className="flex gap-3">
                <Button
                  onClick={startServing}
                  disabled={startingService}
                  className="flex-1 gap-2 gradient-primary text-lg py-6"
                >
                  {startingService ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5" />}
                  Start Serving
                </Button>
                <Button
                  onClick={skipTicket}
                  variant="outline"
                  className="gap-2 text-destructive py-6"
                >
                  <XCircle className="h-5 w-5" /> No Show
                </Button>
              </div>
            )}

            {nextTicket.ticket.status === "serving" && (
              <Button
                onClick={markCompleted}
                className="w-full gap-2 bg-success hover:bg-success/90 text-success-foreground text-lg py-6"
              >
                <CheckCircle className="h-5 w-5" /> Mark as Completed
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="queue">Queue ({waitingTickets.length})</TabsTrigger>
          <TabsTrigger value="scanner"><QrCode className="h-4 w-4 mr-1" />QR Verify</TabsTrigger>
          <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-2">
          {/* Show ordered queue - read only, staff must use Call Next */}
          {tickets.length === 0 && <p className="text-center text-muted-foreground py-8">No active tickets</p>}
          {[...tickets]
            .sort((a, b) => {
              // serving first, then waiting sorted by priority + time
              if (a.status === "serving" && b.status !== "serving") return -1;
              if (b.status === "serving" && a.status !== "serving") return 1;
              const pa = priorityOrder[a.priority] ?? 2;
              const pb = priorityOrder[b.priority] ?? 2;
              if (pa !== pb) return pa - pb;
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            })
            .map((ticket, idx) => {
              const svc = services.find(s => s.id === ticket.service_id);
              const isNext = ticket.status === "waiting" && getNextWaiting()?.id === ticket.id;
              return (
                <Card key={ticket.id} className={`shadow-card border-0 ${isNext ? "ring-2 ring-primary" : ""}`}>
                  <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                        {ticket.status === "serving" ? "▶" : idx + 1}
                      </div>
                      <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
                        <span className="text-primary-foreground font-display font-bold text-xs">{ticket.ticket_number}</span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">{ticket.ticket_number}</p>
                        <p className="text-xs text-muted-foreground">{svc?.name || "—"}</p>
                      </div>
                      <Badge variant="outline" className={statusColors[ticket.status]}>{ticket.status}</Badge>
                      {ticket.priority !== "normal" && <Badge variant="outline">{ticket.priority}</Badge>}
                    </div>
                    {isNext && (
                      <Badge className="gradient-primary text-primary-foreground">Next</Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
        </TabsContent>

        <TabsContent value="scanner">
          <QrScanner />
        </TabsContent>

        <TabsContent value="documents" className="space-y-2">
          {documents.map((doc) => (
            <Card key={doc.id} className="shadow-card border-0">
              <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                <div className="flex-1">
                  <p className="font-medium text-sm">{doc.document_name}</p>
                  <p className="text-xs text-muted-foreground">Uploaded {new Date(doc.created_at).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">User: {doc.user_id?.slice(0, 8)}…</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => viewDocument(doc.file_path)}>
                    <Eye className="h-3 w-3" /> View
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 text-success" onClick={() => verifyDocument(doc.id)}>
                    <CheckCircle className="h-3 w-3" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => openRejectDialog(doc.id)}>
                    <XCircle className="h-3 w-3" /> Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {documents.length === 0 && <p className="text-center text-muted-foreground py-8">No pending documents</p>}
        </TabsContent>
      </Tabs>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Please provide a reason for rejection so the user can correct and re-upload.</p>
            <Textarea
              placeholder="e.g. Document is blurry, wrong document type, expired ID..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmReject}>Reject Document</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Document Preview</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <div className="overflow-auto max-h-[60vh]">
              {previewUrl.includes(".pdf") ? (
                <iframe src={previewUrl} className="w-full h-[55vh] border rounded" />
              ) : (
                <img src={previewUrl} alt="Document" className="w-full h-auto rounded" />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
