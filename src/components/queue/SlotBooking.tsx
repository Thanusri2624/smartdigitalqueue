import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CalendarDays, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface Props {
  serviceId: string;
  onSlotBooked: (slotId: string, ticketId: string) => void;
}

export default function SlotBooking({ serviceId, onSlotBooked }: Props) {
  const { user } = useAuth();
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceId) return;
    const today = new Date().toISOString().split("T")[0];
    supabase
      .from("service_slots")
      .select("*")
      .eq("service_id", serviceId)
      .eq("is_active", true)
      .gte("slot_date", today)
      .order("slot_date")
      .order("slot_time")
      .then(({ data }) => {
        setSlots((data || []).filter(s => s.booked_count < s.max_tokens));
      });
  }, [serviceId]);

  const generateTicketNumber = () => {
    const prefix = "SQ";
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${num}`;
  };

  const bookSlot = async (slot: any) => {
    if (!user) return;
    setLoading(slot.id);

    // Increment booked count
    const { error: updateError } = await supabase
      .from("service_slots")
      .update({ booked_count: slot.booked_count + 1 })
      .eq("id", slot.id);

    if (updateError) { toast.error(updateError.message); setLoading(null); return; }

    // Fetch service name for QR code
    const { data: svcData } = await supabase.from("services").select("name, estimated_time_minutes").eq("id", serviceId).single();
    const serviceName = svcData?.name || "Service";

    // Calculate correct position based on waiting tickets for this service
    const { count: waitingCount } = await supabase
      .from("queue_tickets")
      .select("*", { count: "exact", head: true })
      .eq("service_id", serviceId)
      .eq("status", "waiting");

    // Generate queue ticket for this slot
    const ticketNumber = generateTicketNumber();
    const position = (waitingCount || 0) + 1;
    const qrData = JSON.stringify({
      ticket: ticketNumber,
      service: serviceName,
      slot_date: slot.slot_date,
      slot_time: `${slot.slot_time?.slice(0, 5)} - ${slot.end_time?.slice(0, 5) || "?"}`,
      priority: "normal",
      userId: user.id,
      position,
    });

    const { data: ticketData, error: ticketError } = await supabase.from("queue_tickets").insert({
      ticket_number: ticketNumber,
      user_id: user.id,
      service_id: serviceId,
      priority: "normal",
      position,
      estimated_wait_minutes: 0,
      qr_code_data: qrData,
      status: "waiting",
    }).select().single();

    if (ticketError) { toast.error(ticketError.message); setLoading(null); return; }

    // Create slot booking linked to ticket
    const { error: bookError } = await supabase.from("slot_bookings").insert({
      user_id: user.id,
      slot_id: slot.id,
      status: "booked",
      ticket_id: ticketData.id,
    });

    if (bookError) { toast.error(bookError.message); setLoading(null); return; }

    // Send notification
    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "Slot Booked",
      message: `Slot booked for ${serviceName} on ${format(new Date(slot.slot_date), "EEE, MMM d")} at ${slot.slot_time?.slice(0, 5)}. Your ticket: ${ticketNumber}.`,
      ticket_id: ticketData.id,
    });

    toast.success(`Slot booked! Ticket: ${ticketNumber}`);
    onSlotBooked(slot.id, ticketData.id);
    setLoading(null);
  };

  if (slots.length === 0) {
    return (
      <Card className="shadow-elevated border-0">
        <CardContent className="p-6 text-center">
          <CalendarDays className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No available slots for this service</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-elevated border-0">
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <CalendarDays className="h-5 w-5" /> Book a Slot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {slots.map((slot) => {
          const remaining = slot.max_tokens - slot.booked_count;
          return (
            <div key={slot.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{format(new Date(slot.slot_date), "EEE, MMM d")}</p>
                  <p className="text-xs text-muted-foreground">{slot.slot_time?.slice(0, 5)} – {slot.end_time?.slice(0, 5) || "?"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-xs ${remaining <= 3 ? "text-destructive" : ""}`}>
                  {remaining} left
                </Badge>
                <Button size="sm" className="gradient-primary" onClick={() => bookSlot(slot)} disabled={loading === slot.id}>
                  {loading === slot.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Book"}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
