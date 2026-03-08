import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Camera, CameraOff, CheckCircle, Search, XCircle } from "lucide-react";

interface ScannedTicket {
  id: string;
  ticket_number: string;
  status: string;
  priority: string;
  service_name: string;
  user_name: string;
}

export default function QrScanner() {
  const { user } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [scannedTicket, setScannedTicket] = useState<ScannedTicket | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-reader";

  const startScanner = async () => {
    try {
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          await scanner.stop();
          setScanning(false);
          await handleScan(decodedText);
        },
        () => {}
      );
      setScanning(true);
    } catch (err) {
      toast.error("Could not access camera. Please allow camera permission.");
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current?.isScanning) {
      await scannerRef.current.stop();
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  const handleScan = async (data: string) => {
    try {
      const parsed = JSON.parse(data);
      const ticketNumber = parsed.ticket;
      if (!ticketNumber) throw new Error("Invalid QR");

      const { data: ticket } = await supabase
        .from("queue_tickets")
        .select("*, services(name)")
        .eq("ticket_number", ticketNumber)
        .single();

      if (!ticket) {
        toast.error("Ticket not found");
        return;
      }

      // Fetch user name
      let userName = "—";
      if (ticket.user_id) {
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", ticket.user_id).single();
        if (profile) userName = profile.full_name || "—";
      }

      setScannedTicket({
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        status: ticket.status,
        priority: ticket.priority,
        service_name: (ticket.services as any)?.name || "—",
        user_name: userName,
      });

      // Log activity
      if (user) {
        await supabase.from("staff_activity_logs").insert({
          staff_id: user.id,
          action: "scanned_qr",
          ticket_id: ticket.id,
          details: { ticket_number: ticket.ticket_number, message: `Scanned QR for ${ticket.ticket_number}` },
        });
      }
    } catch {
      toast.error("Invalid QR code");
    }
  };

  const markServed = async () => {
    if (!scannedTicket || !user) return;
    const { error } = await supabase.from("queue_tickets").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", scannedTicket.id);

    if (error) { toast.error(error.message); return; }

    await supabase.from("staff_activity_logs").insert({
      staff_id: user.id,
      action: "completed",
      ticket_id: scannedTicket.id,
      details: { ticket_number: scannedTicket.ticket_number, message: `Marked ${scannedTicket.ticket_number} as served` },
    });

    toast.success(`${scannedTicket.ticket_number} marked as served`);
    setScannedTicket(prev => prev ? { ...prev, status: "completed" } : null);
  };

  const statusColors: Record<string, string> = {
    waiting: "bg-warning/10 text-warning",
    serving: "bg-success/10 text-success",
    completed: "bg-muted text-muted-foreground",
    cancelled: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-card border-0">
        <CardHeader>
          <CardTitle className="font-display text-lg">QR Scanner</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div id={containerId} className="w-full max-w-sm mx-auto rounded-lg overflow-hidden" />
          <div className="flex justify-center">
            {!scanning ? (
              <Button onClick={startScanner} className="gradient-primary gap-2">
                <Camera className="h-4 w-4" /> Start Scanner
              </Button>
            ) : (
              <Button onClick={stopScanner} variant="outline" className="gap-2">
                <CameraOff className="h-4 w-4" /> Stop Scanner
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {scannedTicket && (
        <Card className="shadow-elevated border-0 animate-slide-up">
          <CardHeader>
            <CardTitle className="font-display text-lg">Scanned Ticket</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg gradient-primary flex items-center justify-center">
                <span className="text-primary-foreground font-display font-bold text-sm">{scannedTicket.ticket_number}</span>
              </div>
              <div>
                <p className="font-medium">{scannedTicket.ticket_number}</p>
                <p className="text-sm text-muted-foreground">{scannedTicket.service_name}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">User:</span> {scannedTicket.user_name}</div>
              <div><span className="text-muted-foreground">Priority:</span> <Badge variant="outline">{scannedTicket.priority}</Badge></div>
              <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className={statusColors[scannedTicket.status]}>{scannedTicket.status}</Badge></div>
            </div>
            {(scannedTicket.status === "waiting" || scannedTicket.status === "serving") && (
              <div className="flex gap-2 pt-2">
                <Button onClick={markServed} className="flex-1 gap-2 bg-success hover:bg-success/90 text-success-foreground">
                  <CheckCircle className="h-4 w-4" /> Mark as Served
                </Button>
              </div>
            )}
            {scannedTicket.status === "completed" && (
              <div className="flex items-center gap-2 text-success py-2">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Already served</span>
              </div>
            )}
            {scannedTicket.status === "cancelled" && (
              <div className="flex items-center gap-2 text-destructive py-2">
                <XCircle className="h-5 w-5" />
                <span className="font-medium">Ticket cancelled</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
