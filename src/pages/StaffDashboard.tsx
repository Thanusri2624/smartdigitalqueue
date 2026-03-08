import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  AlertTriangle,
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
  RotateCcw,
  Timer,
  User,
  Users,
  XCircle,
} from "lucide-react";
import QrScanner from "@/components/staff/QrScanner";
import type { Tables } from "@/integrations/supabase/types";

const statusColors: Record<string, string> = {
  waiting: "bg-warning/10 text-warning",
  called: "bg-primary/10 text-primary",
  serving: "bg-success/10 text-success",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-destructive/10 text-destructive",
};

const priorityOrder: Record<string, number> = {
  emergency: 0, senior: 1, pregnant: 1, disabled: 1, normal: 2,
};

const GRACE_PERIOD_SECONDS = 120; // 2 minutes

interface CalledTicketDetails {
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

  // Called ticket with grace period
  const [calledTicket, setCalledTicket] = useState<CalledTicketDetails | null>(null);
  const [loadingNext, setLoadingNext] = useState(false);
  const [graceTimeLeft, setGraceTimeLeft] = useState(0);
  const [verified, setVerified] = useState(false);
  const graceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Previous no-show for recall
  const [lastNoShow, setLastNoShow] = useState<CalledTicketDetails | null>(null);

  const fetchAll = async () => {
    const [t, s] = await Promise.all([
      supabase.from("queue_tickets").select("*").in("status", ["waiting", "called", "serving"]).order("created_at"),
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

  // Restore active ticket on load
  const restoreActiveTicket = async (ticketsList: Tables<"queue_tickets">[], servicesList: Tables<"services">[]) => {
    if (calledTicket) return; // Already have one
    
    // Find a ticket that's currently being served or called
    const serving = ticketsList.find(t => t.status === "serving");
    const called = ticketsList.find(t => t.status === "called");
    const active = serving || called;
    
    if (active) {
      const details = await fetchTicketDetailsWithServices(active, servicesList);
      setCalledTicket(details);
      if (active.status === "called") {
        // Resume grace timer with remaining time
        const calledTime = active.called_at ? new Date(active.called_at).getTime() : Date.now();
        const elapsed = Math.floor((Date.now() - calledTime) / 1000);
        const remaining = Math.max(0, GRACE_PERIOD_SECONDS - elapsed);
        if (remaining > 0) {
          setGraceTimeLeft(remaining);
          setVerified(false);
          if (graceTimerRef.current) clearInterval(graceTimerRef.current);
          graceTimerRef.current = setInterval(() => {
            setGraceTimeLeft(prev => prev <= 1 ? 0 : prev - 1);
          }, 1000);
        }
      } else {
        setVerified(true);
      }
    }
  };

  // Separate fetchTicketDetails that accepts services list (for init before state is set)
  const fetchTicketDetailsWithServices = async (ticket: Tables<"queue_tickets">, servicesList: Tables<"services">[]): Promise<CalledTicketDetails> => {
    const svc = servicesList.find(s => s.id === ticket.service_id);

    let userName = "—";
    let userPhone: string | null = null;
    let userDob: string | null = null;
    let isPregnant = false;
    let isDisabled = false;
    if (ticket.user_id) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("full_name, phone, date_of_birth, is_pregnant, is_disabled")
        .eq("user_id", ticket.user_id);
      const profile = profiles?.[0] || null;
      if (profile) {
        userName = profile.full_name || "—";
        userPhone = profile.phone;
        userDob = profile.date_of_birth;
        isPregnant = profile.is_pregnant;
        isDisabled = profile.is_disabled;
      }
    }

    let docs: { id: string; document_name: string; status: string }[] = [];
    if (ticket.user_id) {
      const { data: d } = await supabase
        .from("document_uploads")
        .select("id, document_name, status")
        .eq("user_id", ticket.user_id)
        .eq("service_id", ticket.service_id);
      docs = d || [];
    }

    return {
      ticket,
      serviceName: svc?.name || "—",
      serviceDescription: svc?.description || "",
      userName,
      userPhone,
      userDob,
      isPregnant,
      isDisabled,
      documents: docs,
    };
  };

  useEffect(() => {
    const init = async () => {
      const [t, s] = await Promise.all([
        supabase.from("queue_tickets").select("*").in("status", ["waiting", "called", "serving"]).order("created_at"),
        supabase.from("services").select("*"),
      ]);
      setTickets(t.data || []);
      setServices(s.data || []);
      await restoreActiveTicket(t.data || [], s.data || []);
    };
    init();
    fetchDocuments();
    const channel = supabase
      .channel("staff-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_tickets" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "document_uploads" }, fetchDocuments)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Grace period countdown
  useEffect(() => {
    if (graceTimeLeft <= 0 && graceTimerRef.current) {
      clearInterval(graceTimerRef.current);
      graceTimerRef.current = null;
      // Auto no-show if not verified
      if (calledTicket && !verified && calledTicket.ticket.status === "called") {
        handleAutoNoShow();
      }
    }
  }, [graceTimeLeft, verified, calledTicket]);

  const startGraceTimer = () => {
    setGraceTimeLeft(GRACE_PERIOD_SECONDS);
    setVerified(false);
    if (graceTimerRef.current) clearInterval(graceTimerRef.current);
    graceTimerRef.current = setInterval(() => {
      setGraceTimeLeft(prev => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (graceTimerRef.current) clearInterval(graceTimerRef.current);
    };
  }, []);

  const getNextWaiting = useCallback(() => {
    const waiting = tickets.filter(t => t.status === "waiting");
    if (waiting.length === 0) return null;
    const sorted = [...waiting].sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 2;
      const pb = priorityOrder[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    return sorted[0];
  }, [tickets]);

  const fetchTicketDetails = async (ticket: Tables<"queue_tickets">): Promise<CalledTicketDetails> => {
    const svc = services.find(s => s.id === ticket.service_id);

    let userName = "—";
    let userPhone: string | null = null;
    let userDob: string | null = null;
    let isPregnant = false;
    let isDisabled = false;
    if (ticket.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone, date_of_birth, is_pregnant, is_disabled")
        .eq("user_id", ticket.user_id)
        .single();
      if (profile) {
        userName = profile.full_name || "—";
        userPhone = profile.phone;
        userDob = profile.date_of_birth;
        isPregnant = profile.is_pregnant;
        isDisabled = profile.is_disabled;
      }
    }

    let docs: { id: string; document_name: string; status: string }[] = [];
    if (ticket.user_id) {
      const { data: d } = await supabase
        .from("document_uploads")
        .select("id, document_name, status")
        .eq("user_id", ticket.user_id)
        .eq("service_id", ticket.service_id);
      docs = d || [];
    }

    return {
      ticket,
      serviceName: svc?.name || "—",
      serviceDescription: svc?.description || "",
      userName,
      userPhone,
      userDob,
      isPregnant,
      isDisabled,
      documents: docs,
    };
  };

  const callNext = async () => {
    const next = getNextWaiting();
    if (!next) { toast.info("No tickets waiting"); return; }

    setLoadingNext(true);

    // Update status to "called"
    const { error } = await supabase.from("queue_tickets").update({
      status: "called" as any,
      called_at: new Date().toISOString(),
    }).eq("id", next.id);

    if (error) { toast.error(error.message); setLoadingNext(false); return; }

    // Notify user
    if (next.user_id) {
      await supabase.from("notifications").insert({
        user_id: next.user_id,
        title: "You've Been Called!",
        message: `Your ticket ${next.ticket_number} has been called. Please proceed to the counter within 2 minutes and scan your QR code.`,
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

    const details = await fetchTicketDetails({ ...next, status: "called" as any });
    setCalledTicket(details);
    startGraceTimer();
    setLoadingNext(false);
    toast.success(`Called ${next.ticket_number} — waiting for QR check-in`);
  };

  const handleAutoNoShow = async () => {
    if (!calledTicket || !user) return;

    const { error } = await supabase.from("queue_tickets").update({
      status: "no_show",
    }).eq("id", calledTicket.ticket.id);

    if (error) { toast.error(error.message); return; }

    await supabase.from("staff_activity_logs").insert({
      staff_id: user.id,
      action: "auto_no_show",
      ticket_id: calledTicket.ticket.id,
      details: { ticket_number: calledTicket.ticket.ticket_number, message: `Auto no-show: ${calledTicket.ticket.ticket_number} (grace period expired)` },
    });

    if (calledTicket.ticket.user_id) {
      await supabase.from("notifications").insert({
        user_id: calledTicket.ticket.user_id,
        title: "Missed Your Turn",
        message: `Your ticket ${calledTicket.ticket.ticket_number} was marked as No Show because you didn't check in within the grace period.`,
        ticket_id: calledTicket.ticket.id,
      });
    }

    toast.warning(`${calledTicket.ticket.ticket_number} marked as No Show (grace period expired)`);
    setLastNoShow(calledTicket);
    setCalledTicket(null);
  };

  // Called by QR scanner when a ticket is verified
  const handleQrVerified = useCallback(async (ticketId: string) => {
    if (!calledTicket || calledTicket.ticket.id !== ticketId) {
      toast.error("This ticket is not the currently called ticket");
      return;
    }

    // Stop grace timer
    if (graceTimerRef.current) {
      clearInterval(graceTimerRef.current);
      graceTimerRef.current = null;
    }

    // Update to serving
    const { error } = await supabase.from("queue_tickets").update({
      status: "serving",
    }).eq("id", ticketId);

    if (error) { toast.error(error.message); return; }

    if (user) {
      await supabase.from("staff_activity_logs").insert({
        staff_id: user.id,
        action: "qr_verified",
        ticket_id: ticketId,
        details: { ticket_number: calledTicket.ticket.ticket_number, message: `QR verified: ${calledTicket.ticket.ticket_number}` },
      });
    }

    setVerified(true);
    setCalledTicket(prev => prev ? { ...prev, ticket: { ...prev.ticket, status: "serving" as any } } : null);
    toast.success(`${calledTicket.ticket.ticket_number} verified — now serving!`);
  }, [calledTicket, user]);

  const markCompleted = async () => {
    if (!calledTicket || !user) return;
    const { error } = await supabase.from("queue_tickets").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", calledTicket.ticket.id);

    if (error) { toast.error(error.message); return; }

    await supabase.from("staff_activity_logs").insert({
      staff_id: user.id,
      action: "completed",
      ticket_id: calledTicket.ticket.id,
      details: { ticket_number: calledTicket.ticket.ticket_number, message: `Completed ${calledTicket.ticket.ticket_number}` },
    });

    toast.success(`${calledTicket.ticket.ticket_number} completed`);
    setCalledTicket(null);
    setLastNoShow(null);
    setVerified(false);
    setGraceTimeLeft(0);
    if (graceTimerRef.current) {
      clearInterval(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  };

  const recallPrevious = async () => {
    if (!lastNoShow || !user) return;

    // Move back to "called"
    const { error } = await supabase.from("queue_tickets").update({
      status: "called" as any,
      called_at: new Date().toISOString(),
    }).eq("id", lastNoShow.ticket.id);

    if (error) { toast.error(error.message); return; }

    await supabase.from("staff_activity_logs").insert({
      staff_id: user.id,
      action: "recalled",
      ticket_id: lastNoShow.ticket.id,
      details: { ticket_number: lastNoShow.ticket.ticket_number, message: `Recalled ${lastNoShow.ticket.ticket_number}` },
    });

    if (lastNoShow.ticket.user_id) {
      await supabase.from("notifications").insert({
        user_id: lastNoShow.ticket.user_id,
        title: "You've Been Recalled!",
        message: `Your ticket ${lastNoShow.ticket.ticket_number} has been recalled. Please proceed to the counter immediately.`,
        ticket_id: lastNoShow.ticket.id,
      });
    }

    setCalledTicket({ ...lastNoShow, ticket: { ...lastNoShow.ticket, status: "called" as any } });
    startGraceTimer();
    setLastNoShow(null);
    toast.success(`Recalled ${lastNoShow.ticket.ticket_number}`);
  };

  const manualNoShow = async () => {
    if (!calledTicket || !user) return;
    if (graceTimerRef.current) {
      clearInterval(graceTimerRef.current);
      graceTimerRef.current = null;
    }

    const { error } = await supabase.from("queue_tickets").update({
      status: "no_show",
    }).eq("id", calledTicket.ticket.id);

    if (error) { toast.error(error.message); return; }

    await supabase.from("staff_activity_logs").insert({
      staff_id: user.id,
      action: "manual_no_show",
      ticket_id: calledTicket.ticket.id,
      details: { ticket_number: calledTicket.ticket.ticket_number, message: `Manual no-show: ${calledTicket.ticket.ticket_number}` },
    });

    toast.info(`${calledTicket.ticket.ticket_number} marked as No Show`);
    setLastNoShow(calledTicket);
    setCalledTicket(null);
    setGraceTimeLeft(0);
  };

  const viewDocument = async (filePath: string) => {
    const { data } = await supabase.storage.from("documents").createSignedUrl(filePath, 300);
    if (data?.signedUrl) { setPreviewUrl(data.signedUrl); setPreviewDialogOpen(true); }
    else toast.error("Could not load document preview");
  };

  const verifyDocument = async (docId: string) => {
    const { error } = await supabase.from("document_uploads").update({
      status: "verified", verified_by: user?.id, updated_at: new Date().toISOString(),
    }).eq("id", docId);
    if (error) toast.error(error.message);
    else { toast.success("Document approved"); fetchDocuments(); }
    if (user) {
      await supabase.from("staff_activity_logs").insert({
        staff_id: user.id, action: "verified_document", details: { message: "Document verified", document_id: docId },
      });
    }
  };

  const openRejectDialog = (docId: string) => {
    setRejectingDocId(docId); setRejectReason(""); setRejectDialogOpen(true);
  };

  const confirmReject = async () => {
    if (!rejectingDocId) return;
    if (!rejectReason.trim()) { toast.error("Please provide a reason for rejection"); return; }
    const { error } = await supabase.from("document_uploads").update({
      status: "rejected", notes: rejectReason.trim(), verified_by: user?.id, updated_at: new Date().toISOString(),
    }).eq("id", rejectingDocId);
    if (error) toast.error(error.message);
    else { toast.success("Document rejected"); fetchDocuments(); }
    if (user) {
      await supabase.from("staff_activity_logs").insert({
        staff_id: user.id, action: "rejected_document", details: { message: `Rejected: ${rejectReason.trim()}`, document_id: rejectingDocId },
      });
    }
    setRejectDialogOpen(false); setRejectingDocId(null); setRejectReason("");
  };

  const waitingTickets = tickets.filter(t => t.status === "waiting");
  const calledTickets = tickets.filter(t => t.status === "called");
  const servingTickets = tickets.filter(t => t.status === "serving");

  const docStatusColors: Record<string, string> = {
    pending: "bg-warning/10 text-warning",
    verified: "bg-success/10 text-success",
    rejected: "bg-destructive/10 text-destructive",
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold">Staff Dashboard</h1>
          <p className="text-muted-foreground">Manage queue in order with QR check-in verification</p>
        </div>
        <div className="flex gap-2">
          {lastNoShow && !calledTicket && (
            <Button variant="outline" className="gap-2" onClick={recallPrevious}>
              <RotateCcw className="h-4 w-4" /> Recall {lastNoShow.ticket.ticket_number}
            </Button>
          )}
          <Button className="gradient-primary gap-2" onClick={callNext} disabled={loadingNext || (!!calledTicket && calledTicket.ticket.status !== "serving")}>
            {loadingNext ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
            Call Next
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Timer className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{calledTickets.length}</p>
              <p className="text-xs text-muted-foreground">Called</p>
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

      {/* Called Ticket Panel with Grace Period */}
      {calledTicket && (
        <Card className={`shadow-elevated border-0 mb-8 animate-slide-up border-l-4 ${
          calledTicket.ticket.status === "serving" ? "border-l-success" : "border-l-primary"
        }`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="font-display text-lg">
                {calledTicket.ticket.status === "serving"
                  ? "✅ Verified — Now Serving"
                  : "📢 Called — Waiting for QR Check-in"}
              </CardTitle>
              {calledTicket.ticket.status === "called" && (
                <div className="flex items-center gap-2">
                  <Timer className={`h-5 w-5 ${graceTimeLeft <= 30 ? "text-destructive animate-pulse" : "text-primary"}`} />
                  <span className={`font-mono text-lg font-bold ${graceTimeLeft <= 30 ? "text-destructive" : "text-primary"}`}>
                    {formatTime(graceTimeLeft)}
                  </span>
                </div>
              )}
            </div>
            {calledTicket.ticket.status === "called" && (
              <Progress
                value={(graceTimeLeft / GRACE_PERIOD_SECONDS) * 100}
                className="mt-2 h-2"
              />
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Ticket info */}
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl gradient-primary flex items-center justify-center">
                <span className="text-primary-foreground font-display font-bold text-sm">{calledTicket.ticket.ticket_number}</span>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-lg">{calledTicket.ticket.ticket_number}</p>
                <div className="flex gap-2 mt-1">
                  <Badge variant="outline" className={statusColors[calledTicket.ticket.status]}>
                    {calledTicket.ticket.status}
                  </Badge>
                  <Badge variant="outline">{calledTicket.ticket.priority}</Badge>
                </div>
              </div>
            </div>

            <Separator />

            {/* Reason */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reason for Visit</p>
              <p className="font-semibold">{calledTicket.serviceName}</p>
              {calledTicket.serviceDescription && (
                <p className="text-sm text-muted-foreground">{calledTicket.serviceDescription}</p>
              )}
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Clock className="h-3 w-3" />
                Est. {calledTicket.ticket.estimated_wait_minutes ?? "—"} min • Joined {new Date(calledTicket.ticket.created_at).toLocaleTimeString()}
              </div>
            </div>

            <Separator />

            {/* User */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">User Information</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{calledTicket.userName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{calledTicket.userPhone || "Not provided"}</span>
                </div>
                {calledTicket.userDob && (
                  <div className="col-span-2 text-muted-foreground">
                    DOB: {new Date(calledTicket.userDob).toLocaleDateString()}
                  </div>
                )}
                {(calledTicket.isPregnant || calledTicket.isDisabled) && (
                  <div className="col-span-2 flex gap-2">
                    {calledTicket.isPregnant && <Badge variant="outline" className="bg-accent/50">Pregnant</Badge>}
                    {calledTicket.isDisabled && <Badge variant="outline" className="bg-accent/50">Disabled</Badge>}
                  </div>
                )}
              </div>
            </div>

            {/* Documents */}
            {calledTicket.documents.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Documents</p>
                  {calledTicket.documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between text-sm py-1">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span>{doc.document_name}</span>
                      </div>
                      <Badge variant="outline" className={docStatusColors[doc.status] || ""}>{doc.status}</Badge>
                    </div>
                  ))}
                </div>
              </>
            )}

            <Separator />

            {/* Actions */}
            {calledTicket.ticket.status === "called" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <QrCode className="h-5 w-5 text-primary" />
                  <p className="text-sm">Waiting for user to scan QR code at the counter…</p>
                </div>
                <Button
                  onClick={manualNoShow}
                  variant="outline"
                  className="w-full gap-2 text-destructive"
                >
                  <XCircle className="h-4 w-4" /> Mark as No Show
                </Button>
              </div>
            )}

            {calledTicket.ticket.status === "serving" && (
              <Button
                onClick={markCompleted}
                className="w-full gap-2 bg-success hover:bg-success/90 text-success-foreground text-lg py-6"
              >
                <CheckCircle className="h-5 w-5" /> Mark as Served
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="queue">Queue ({waitingTickets.length})</TabsTrigger>
          <TabsTrigger value="scanner"><QrCode className="h-4 w-4 mr-1" />QR Check-in</TabsTrigger>
          <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-2">
          {tickets.length === 0 && <p className="text-center text-muted-foreground py-8">No active tickets</p>}
          {[...tickets]
            .sort((a, b) => {
              const statusOrder: Record<string, number> = { serving: 0, called: 1, waiting: 2 };
              const sa = statusOrder[a.status] ?? 3;
              const sb = statusOrder[b.status] ?? 3;
              if (sa !== sb) return sa - sb;
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
                        {ticket.status === "serving" ? "▶" : ticket.status === "called" ? "📢" : idx + 1}
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
                    <div className="flex items-center gap-2">
                      {isNext && <Badge className="gradient-primary text-primary-foreground">Next</Badge>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </TabsContent>

        <TabsContent value="scanner">
          <QrScanner
            calledTicketId={calledTicket?.ticket.id || null}
            onVerified={handleQrVerified}
          />
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
          <DialogHeader><DialogTitle>Reject Document</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Provide a reason for rejection.</p>
            <Textarea placeholder="e.g. Document is blurry, expired ID..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmReject}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Preview */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader><DialogTitle>Document Preview</DialogTitle></DialogHeader>
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
