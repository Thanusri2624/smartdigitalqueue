import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CalendarDays, CalendarIcon, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Props {
  serviceId: string;
  onSlotBooked: (slotId: string, ticketId: string) => void;
}

export default function SlotBooking({ serviceId, onSlotBooked }: Props) {
  const { user } = useAuth();
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState("");

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

  // Dates that have available slots
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    slots.forEach(s => dates.add(s.slot_date));
    return dates;
  }, [slots]);

  // Find matching slot for selected date + time
  const matchedSlot = useMemo(() => {
    if (!selectedDate || !selectedTime) return null;
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    return slots.find(s => {
      if (s.slot_date !== dateStr) return false;
      const startTime = s.slot_time?.slice(0, 5);
      const endTime = s.end_time?.slice(0, 5);
      if (!startTime || !endTime) return selectedTime === startTime;
      return selectedTime >= startTime && selectedTime < endTime;
    }) || null;
  }, [slots, selectedDate, selectedTime]);

  // Available time ranges for selected date
  const availableRanges = useMemo(() => {
    if (!selectedDate) return [];
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    return slots.filter(s => s.slot_date === dateStr);
  }, [slots, selectedDate]);

  const generateTicketNumber = () => {
    const prefix = "SQ";
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${num}`;
  };

  const bookSlot = async () => {
    if (!user || !matchedSlot) return;
    setLoading(true);
    const slot = matchedSlot;

    const { error: updateError } = await supabase
      .from("service_slots")
      .update({ booked_count: slot.booked_count + 1 })
      .eq("id", slot.id);

    if (updateError) { toast.error(updateError.message); setLoading(false); return; }

    const { data: svcData } = await supabase.from("services").select("name, estimated_time_minutes").eq("id", serviceId).single();
    const serviceName = svcData?.name || "Service";

    const { count: waitingCount } = await supabase
      .from("queue_tickets")
      .select("*", { count: "exact", head: true })
      .eq("service_id", serviceId)
      .eq("status", "waiting");

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

    if (ticketError) { toast.error(ticketError.message); setLoading(false); return; }

    const { error: bookError } = await supabase.from("slot_bookings").insert({
      user_id: user.id,
      slot_id: slot.id,
      status: "booked",
      ticket_id: ticketData.id,
    });

    if (bookError) { toast.error(bookError.message); setLoading(false); return; }

    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "Slot Booked",
      message: `Slot booked for ${serviceName} on ${format(new Date(slot.slot_date), "EEE, MMM d")} at ${selectedTime}. Your ticket: ${ticketNumber}.`,
      ticket_id: ticketData.id,
    });

    toast.success(`Slot booked! Ticket: ${ticketNumber}`);
    onSlotBooked(slot.id, ticketData.id);
    setLoading(false);
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
      <CardContent className="space-y-4">
        {/* Step 1: Pick a date */}
        <div className="space-y-2">
          <p className="text-sm font-medium">1. Choose a date</p>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !selectedDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, "EEE, MMM d, yyyy") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => { setSelectedDate(date); setSelectedTime(""); }}
                disabled={(date) => {
                  const dateStr = format(date, "yyyy-MM-dd");
                  return !availableDates.has(dateStr);
                }}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Step 2: Pick a time */}
        {selectedDate && (
          <div className="space-y-2">
            <p className="text-sm font-medium">2. Choose a time</p>

            {/* Show available time ranges as hint */}
            {availableRanges.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                <p className="text-xs text-muted-foreground w-full">Available time ranges:</p>
                {availableRanges.map((s) => {
                  const remaining = s.max_tokens - s.booked_count;
                  return (
                    <Badge key={s.id} variant="outline" className="text-xs">
                      {s.slot_time?.slice(0, 5)} – {s.end_time?.slice(0, 5) || "?"} ({remaining} spot{remaining !== 1 ? "s" : ""})
                    </Badge>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <Input
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="flex-1"
              />
            </div>

            {selectedTime && !matchedSlot && (
              <p className="text-xs text-destructive">No available slot at this time. Please choose a time within the available ranges above.</p>
            )}

            {selectedTime && matchedSlot && (
              <div className="flex items-center justify-between p-3 rounded-lg border bg-primary/5 border-primary/20">
                <div>
                  <p className="text-sm font-medium">
                    Slot: {matchedSlot.slot_time?.slice(0, 5)} – {matchedSlot.end_time?.slice(0, 5) || "?"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {matchedSlot.max_tokens - matchedSlot.booked_count} spot{matchedSlot.max_tokens - matchedSlot.booked_count !== 1 ? "s" : ""} available
                  </p>
                </div>
                <Button size="sm" className="gradient-primary" onClick={bookSlot} disabled={loading}>
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Book"}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
