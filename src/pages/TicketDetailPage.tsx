import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Clock, Hash, Loader2, MapPin, QrCode, XCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { Tables } from "@/integrations/supabase/types";

const statusColors: Record<string, string> = {
  waiting: "bg-warning/10 text-warning border-warning/30",
  serving: "bg-success/10 text-success border-success/30",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-muted text-muted-foreground",
};

const priorityColors: Record<string, string> = {
  normal: "bg-primary/10 text-primary",
  senior: "bg-warning/10 text-warning",
  pregnant: "bg-priority-pregnant/10 text-priority-pregnant",
  disabled: "bg-priority-disabled/10 text-priority-disabled",
  emergency: "bg-destructive/10 text-destructive",
};

export default function TicketDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Tables<"queue_tickets"> | null>(null);
  const [service, setService] = useState<Tables<"services"> | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTicket = async () => {
    if (!id) return;
    const { data } = await supabase.from("queue_tickets").select("*").eq("id", id).single();
    if (data) {
      setTicket(data);
      const { data: svc } = await supabase.from("services").select("*").eq("id", data.service_id).single();
      setService(svc);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTicket();
    if (!id) return;
    const channel = supabase
      .channel(`ticket-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "queue_tickets", filter: `id=eq.${id}` }, fetchTicket)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const handleCancel = async () => {
    if (!ticket) return;
    
    // Cancel the ticket
    const { error } = await supabase
      .from("queue_tickets")
      .update({ status: "cancelled" })
      .eq("id", ticket.id);
    if (error) {
      toast.error("Failed to cancel");
      return;
    }

    // Cancel associated slot booking and decrement booked_count
    const { data: booking } = await supabase
      .from("slot_bookings")
      .select("id, slot_id")
      .eq("ticket_id", ticket.id)
      .eq("status", "booked")
      .maybeSingle();

    if (booking) {
      await supabase
        .from("slot_bookings")
        .update({ status: "cancelled" })
        .eq("id", booking.id);

      // Decrement booked_count on the slot
      const { data: slot } = await supabase
        .from("service_slots")
        .select("booked_count")
        .eq("id", booking.slot_id)
        .single();

      if (slot && slot.booked_count > 0) {
        await supabase
          .from("service_slots")
          .update({ booked_count: slot.booked_count - 1 })
          .eq("id", booking.slot_id);
      }
    }

    toast.success("Ticket cancelled");
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <p className="text-muted-foreground">Ticket not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const isActive = ticket.status === "waiting" || ticket.status === "serving";

  return (
    <div className="container mx-auto px-4 py-8 max-w-lg">
      <Button variant="ghost" className="mb-4 gap-2" onClick={() => navigate("/dashboard")}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <Card className="shadow-elevated border-0 overflow-hidden">
        {/* Header */}
        <div className="gradient-primary p-6 text-center">
          <p className="text-primary-foreground/80 text-sm mb-1">Ticket Number</p>
          <h1 className="text-4xl font-display font-bold text-primary-foreground">{ticket.ticket_number}</h1>
          <div className="mt-3 flex justify-center gap-2">
            <Badge className={`${statusColors[ticket.status]} border`}>
              {ticket.status.toUpperCase()}
            </Badge>
            <Badge className={priorityColors[ticket.priority]}>
              {ticket.priority}
            </Badge>
          </div>
        </div>

        <CardContent className="p-6 space-y-6">
          {/* QR Code */}
          {ticket.qr_code_data && (
            <div className="flex justify-center">
              <div className="p-4 bg-card rounded-xl border shadow-card">
                <QRCodeSVG
                  value={ticket.qr_code_data}
                  size={180}
                  level="H"
                  includeMargin
                />
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Scan at service counter
                </p>
              </div>
            </div>
          )}

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <MapPin className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Service</p>
                <p className="font-medium text-sm">{service?.name || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Hash className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Position</p>
                <p className="font-medium text-sm">{ticket.position ?? "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Clock className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Est. Wait</p>
                <p className="font-medium text-sm">
                  {ticket.estimated_wait_minutes != null ? `~${ticket.estimated_wait_minutes} min` : "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <QrCode className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="font-medium text-sm">
                  {new Date(ticket.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          </div>

          {/* Status indicator */}
          {ticket.status === "serving" && (
            <div className="p-4 bg-success/10 border border-success/30 rounded-lg text-center animate-pulse-soft">
              <p className="text-success font-display font-semibold text-lg">🎉 It's Your Turn!</p>
              <p className="text-success/80 text-sm">Please proceed to the counter</p>
            </div>
          )}

          {ticket.status === "waiting" && (
            <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg text-center">
              <p className="text-warning font-display font-semibold">Please wait...</p>
              <p className="text-warning/80 text-sm">
                {ticket.position && ticket.position > 1
                  ? `${ticket.position - 1} people ahead of you`
                  : "You're next!"}
              </p>
            </div>
          )}

          {/* Cancel button */}
          {isActive && (
            <Button variant="outline" className="w-full gap-2 text-destructive hover:text-destructive" onClick={handleCancel}>
              <XCircle className="h-4 w-4" />
              Cancel Ticket
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
