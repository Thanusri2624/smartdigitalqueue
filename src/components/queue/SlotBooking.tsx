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
  onSlotBooked: (slotId: string) => void;
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

  const bookSlot = async (slot: any) => {
    if (!user) return;
    setLoading(slot.id);

    // Increment booked count
    const { error: updateError } = await supabase
      .from("service_slots")
      .update({ booked_count: slot.booked_count + 1 })
      .eq("id", slot.id);

    if (updateError) { toast.error(updateError.message); setLoading(null); return; }

    const { error: bookError } = await supabase.from("slot_bookings").insert({
      user_id: user.id,
      slot_id: slot.id,
      status: "booked",
    });

    if (bookError) { toast.error(bookError.message); setLoading(null); return; }

    toast.success("Slot booked!");
    onSlotBooked(slot.id);
    setLoading(null);
  };

  if (slots.length === 0) return null;

  return (
    <Card className="shadow-elevated border-0">
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <CalendarDays className="h-5 w-5" /> Book a Slot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {slots.map((slot) => (
          <div key={slot.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{format(new Date(slot.slot_date), "EEE, MMM d")}</p>
                <p className="text-xs text-muted-foreground">{slot.slot_time?.slice(0, 5)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {slot.max_tokens - slot.booked_count} left
              </Badge>
              <Button size="sm" className="gradient-primary" onClick={() => bookSlot(slot)} disabled={loading === slot.id}>
                {loading === slot.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Book"}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
