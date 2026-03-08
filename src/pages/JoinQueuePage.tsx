import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertTriangle, Baby, CalendarDays, Clock, HeartPulse, Loader2, UserRound } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import DocumentUpload from "@/components/queue/DocumentUpload";
import SlotBooking from "@/components/queue/SlotBooking";

const priorityIcons: Record<string, React.ReactNode> = {
  normal: <UserRound className="h-5 w-5" />,
  senior: <Clock className="h-5 w-5" />,
  pregnant: <Baby className="h-5 w-5" />,
  disabled: <HeartPulse className="h-5 w-5" />,
  emergency: <AlertTriangle className="h-5 w-5" />,
};

const priorityLabels: Record<string, string> = {
  normal: "Normal",
  senior: "Senior Citizen (60+)",
  pregnant: "Pregnant",
  disabled: "Person with Disability",
  emergency: "Emergency",
};

export default function JoinQueuePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState<any[]>([]);
  const [selectedService, setSelectedService] = useState("");
  const [priority, setPriority] = useState<string>("normal");
  const [loading, setLoading] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const [docsUploaded, setDocsUploaded] = useState(true);
  const [mode, setMode] = useState<"queue" | "slot">("queue");
  const [slotBooked, setSlotBooked] = useState(false);

  const selectedSvc = services.find(s => s.id === selectedService);
  const requiredDocs: string[] = selectedSvc?.required_documents || [];
  const slotsEnabled = selectedSvc?.slots_enabled || false;

  useEffect(() => {
    supabase.from("services").select("*").eq("is_active", true).then(({ data }) => {
      setServices(data || []);
    });

    if (user) {
      supabase.from("profiles").select("*").eq("user_id", user.id).single().then(({ data }) => {
        if (data) {
          if (data.date_of_birth) {
            const age = Math.floor((Date.now() - new Date(data.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
            if (age >= 60) { setPriority("senior"); setAutoDetected(true); }
          }
          if (data.is_pregnant) { setPriority("pregnant"); setAutoDetected(true); }
          if (data.is_disabled) { setPriority("disabled"); setAutoDetected(true); }
        }
      });
    }
  }, [user]);

  // Reset state when service changes
  useEffect(() => {
    setDocsUploaded(requiredDocs.length === 0);
    setSlotBooked(false);
    setMode("queue");
  }, [selectedService]);

  const handleDocsUploaded = useCallback((uploaded: boolean) => {
    setDocsUploaded(uploaded);
  }, []);

  const generateTicketNumber = () => {
    const prefix = "SQ";
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${num}`;
  };

  const handleJoin = async () => {
    if (!selectedService) { toast.error("Please select a service"); return; }
    if (!user) return;
    if (requiredDocs.length > 0 && !docsUploaded) {
      toast.error("Please upload all required documents first");
      return;
    }

    setLoading(true);
    const ticketNumber = generateTicketNumber();

    const { count } = await supabase
      .from("queue_tickets")
      .select("*", { count: "exact", head: true })
      .eq("service_id", selectedService)
      .eq("status", "waiting");

    // Check capacity
    if (selectedSvc?.max_queue_capacity && (count || 0) >= selectedSvc.max_queue_capacity) {
      toast.error("Queue is full. Please try again later or book a slot.");
      setLoading(false);
      return;
    }

    const position = (count || 0) + 1;
    const estimatedWait = position * (selectedSvc?.estimated_time_minutes || 10);
    const qrData = JSON.stringify({ ticket: ticketNumber, service: selectedSvc?.name, priority, userId: user.id });

    const { data, error } = await supabase.from("queue_tickets").insert({
      ticket_number: ticketNumber,
      user_id: user.id,
      service_id: selectedService,
      priority: priority as any,
      position,
      estimated_wait_minutes: estimatedWait,
      qr_code_data: qrData,
    }).select().single();

    if (error) { toast.error("Failed to join queue: " + error.message); setLoading(false); return; }

    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "Queue Joined",
      message: `You've joined the queue for ${selectedSvc?.name}. Your ticket: ${ticketNumber}. Estimated wait: ~${estimatedWait} minutes.`,
      ticket_id: data.id,
    });

    toast.success(`Ticket ${ticketNumber} created!`);
    navigate(`/ticket/${data.id}`);
    setLoading(false);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-display font-bold mb-2">Join a Queue</h1>
      <p className="text-muted-foreground mb-8">Select a service and get your ticket</p>

      <Card className="shadow-elevated border-0 mb-6">
        <CardHeader>
          <CardTitle className="font-display">Select Service</CardTitle>
          <CardDescription>Choose the service you need</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedService} onValueChange={setSelectedService}>
            <SelectTrigger><SelectValue placeholder="Choose a service..." /></SelectTrigger>
            <SelectContent>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <div className="flex items-center justify-between w-full">
                    <span>{s.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">~{s.estimated_time_minutes} min</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedService && <p className="text-sm text-muted-foreground">{selectedSvc?.description}</p>}
        </CardContent>
      </Card>

      {/* Required Documents - always show when service has required docs */}
      {selectedService && requiredDocs.length > 0 && (
        <div className="mb-6">
          <Card className="shadow-elevated border-0 mb-4">
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Documents required for {selectedSvc?.name}
              </p>
              <ul className="list-disc list-inside space-y-1">
                {requiredDocs.map((doc) => (
                  <li key={doc} className="text-sm text-muted-foreground">{doc}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <DocumentUpload serviceId={selectedService} requiredDocuments={requiredDocs} onAllUploaded={handleDocsUploaded} />
        </div>
      )}

      {/* Mode Selection: Queue vs Slot */}
      {selectedService && slotsEnabled && (
        <Card className="shadow-elevated border-0 mb-6">
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-3">How would you like to join?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode("queue")}
                className={`p-3 rounded-lg border-2 transition-all text-left ${mode === "queue" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
              >
                <Clock className="h-5 w-5 mb-1" />
                <p className="font-medium text-sm">Join Live Queue</p>
                <p className="text-xs text-muted-foreground">Get a ticket now</p>
              </button>
              <button
                onClick={() => setMode("slot")}
                className={`p-3 rounded-lg border-2 transition-all text-left ${mode === "slot" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
              >
                <CalendarDays className="h-5 w-5 mb-1" />
                <p className="font-medium text-sm">Book a Slot</p>
                <p className="text-xs text-muted-foreground">Reserve for later</p>
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Slot Booking */}
      {selectedService && mode === "slot" && slotsEnabled && (
        <div className="mb-6">
          {requiredDocs.length > 0 && !docsUploaded ? (
            <Card className="shadow-elevated border-0">
              <CardContent className="p-6 text-center space-y-2">
                <AlertTriangle className="h-8 w-8 text-warning mx-auto" />
                <p className="font-medium text-sm">Upload Required Documents First</p>
                <p className="text-xs text-muted-foreground">You must upload all required documents before booking a slot.</p>
              </CardContent>
            </Card>
          ) : (
            <SlotBooking serviceId={selectedService} onSlotBooked={(_slotId, ticketId) => { setSlotBooked(true); navigate(`/ticket/${ticketId}`); }} />
          )}
        </div>
      )}

      {/* Priority Selection (for live queue mode) */}
      {mode === "queue" && (
        <Card className="shadow-elevated border-0 mb-6">
          <CardHeader>
            <CardTitle className="font-display">Priority Level</CardTitle>
            <CardDescription>
              {autoDetected ? "Priority was auto-detected from your profile" : "Select your priority category"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(priorityLabels).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setPriority(key)}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                    priority === key ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    priority === key ? "gradient-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    {priorityIcons[key]}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{label}</p>
                    {key === "senior" && <p className="text-xs text-muted-foreground">Age 60+</p>}
                  </div>
                  {autoDetected && priority === key && (
                    <Badge className="ml-auto text-xs" variant="secondary">Auto</Badge>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "queue" && (
        <Button
          onClick={handleJoin}
          disabled={loading || !selectedService || (requiredDocs.length > 0 && !docsUploaded)}
          className="w-full gradient-primary h-12 text-base"
        >
          {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
          {requiredDocs.length > 0 && !docsUploaded ? "Upload Required Documents First" : "Join Queue"}
        </Button>
      )}
    </div>
  );
}
