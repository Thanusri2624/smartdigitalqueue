import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertTriangle, Baby, Clock, HeartPulse, Loader2, UserRound } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

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
  const [services, setServices] = useState<Tables<"services">[]>([]);
  const [selectedService, setSelectedService] = useState("");
  const [priority, setPriority] = useState<string>("normal");
  const [loading, setLoading] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);

  useEffect(() => {
    supabase.from("services").select("*").eq("is_active", true).then(({ data }) => {
      setServices(data || []);
    });

    // Auto-detect priority from profile
    if (user) {
      supabase.from("profiles").select("*").eq("user_id", user.id).single().then(({ data }) => {
        if (data) {
          if (data.date_of_birth) {
            const age = Math.floor((Date.now() - new Date(data.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
            if (age >= 60) {
              setPriority("senior");
              setAutoDetected(true);
            }
          }
          if (data.is_pregnant) {
            setPriority("pregnant");
            setAutoDetected(true);
          }
          if (data.is_disabled) {
            setPriority("disabled");
            setAutoDetected(true);
          }
        }
      });
    }
  }, [user]);

  const generateTicketNumber = () => {
    const prefix = "SQ";
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${num}`;
  };

  const handleJoin = async () => {
    if (!selectedService) {
      toast.error("Please select a service");
      return;
    }
    if (!user) return;

    setLoading(true);
    const ticketNumber = generateTicketNumber();
    const service = services.find((s) => s.id === selectedService);

    // Count people ahead
    const { count } = await supabase
      .from("queue_tickets")
      .select("*", { count: "exact", head: true })
      .eq("service_id", selectedService)
      .eq("status", "waiting");

    const position = (count || 0) + 1;
    const estimatedWait = position * (service?.estimated_time_minutes || 10);
    const qrData = JSON.stringify({ ticket: ticketNumber, service: service?.name, priority, userId: user.id });

    const { data, error } = await supabase.from("queue_tickets").insert({
      ticket_number: ticketNumber,
      user_id: user.id,
      service_id: selectedService,
      priority: priority as any,
      position,
      estimated_wait_minutes: estimatedWait,
      qr_code_data: qrData,
    }).select().single();

    if (error) {
      toast.error("Failed to join queue: " + error.message);
      setLoading(false);
      return;
    }

    // Create notification
    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "Queue Joined",
      message: `You've joined the queue for ${service?.name}. Your ticket: ${ticketNumber}. Estimated wait: ~${estimatedWait} minutes.`,
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
            <SelectTrigger>
              <SelectValue placeholder="Choose a service..." />
            </SelectTrigger>
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
          {selectedService && (
            <p className="text-sm text-muted-foreground">
              {services.find(s => s.id === selectedService)?.description}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-elevated border-0 mb-6">
        <CardHeader>
          <CardTitle className="font-display">Priority Level</CardTitle>
          <CardDescription>
            {autoDetected
              ? "Priority was auto-detected from your profile"
              : "Select your priority category"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(priorityLabels).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setPriority(key)}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                  priority === key
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
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

      <Button onClick={handleJoin} disabled={loading || !selectedService} className="w-full gradient-primary h-12 text-base">
        {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
        Join Queue
      </Button>
    </div>
  );
}
