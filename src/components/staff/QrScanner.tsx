import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Camera,
  CameraOff,
  CheckCircle,
  Loader2,
  QrCode,
  Search,
  ShieldCheck,
} from "lucide-react";

interface Props {
  calledTicketId: string | null;
  onVerified: (ticketId: string) => void;
}

export default function QrScanner({ calledTicketId, onVerified }: Props) {
  const { user } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [manualTicket, setManualTicket] = useState("");
  const [searching, setSearching] = useState(false);
  const [lastResult, setLastResult] = useState<{ success: boolean; message: string } | null>(null);
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
    } catch {
      toast.error("Could not access camera. Use manual search instead.");
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

  const verifyTicket = async (ticketNumber: string) => {
    if (!calledTicketId) {
      setLastResult({ success: false, message: "No ticket is currently called. Press 'Call Next' first." });
      return;
    }

    // Look up the scanned ticket
    const { data: ticket } = await supabase
      .from("queue_tickets")
      .select("id, ticket_number, status")
      .eq("ticket_number", ticketNumber)
      .single();

    if (!ticket) {
      setLastResult({ success: false, message: `Ticket ${ticketNumber} not found.` });
      return;
    }

    if (ticket.id !== calledTicketId) {
      setLastResult({ success: false, message: `This is ticket ${ticketNumber}, but a different ticket is currently called. Only the called ticket can check in.` });
      return;
    }

    if (ticket.status !== "called") {
      setLastResult({ success: false, message: `Ticket ${ticketNumber} status is "${ticket.status}" — cannot verify.` });
      return;
    }

    // Verified!
    onVerified(ticket.id);
    setLastResult({ success: true, message: `✅ ${ticketNumber} verified! Service started.` });
  };

  const handleScan = async (data: string) => {
    try {
      const parsed = JSON.parse(data);
      const ticketNumber = parsed.ticket;
      if (!ticketNumber) throw new Error("Invalid QR");
      await verifyTicket(ticketNumber);
    } catch {
      setLastResult({ success: false, message: "Invalid QR code format." });
    }
  };

  const handleManualSearch = async () => {
    if (!manualTicket.trim()) return;
    setSearching(true);
    await verifyTicket(manualTicket.trim().toUpperCase());
    setManualTicket("");
    setSearching(false);
  };

  return (
    <div className="space-y-4">
      {/* Status Banner */}
      {!calledTicketId && (
        <Card className="shadow-card border-0 border-l-4 border-l-warning">
          <CardContent className="p-4 flex items-center gap-3">
            <QrCode className="h-5 w-5 text-warning" />
            <p className="text-sm">No ticket is currently called. Click <strong>"Call Next"</strong> to call a token, then scan the user's QR code to verify their presence.</p>
          </CardContent>
        </Card>
      )}

      {calledTicketId && (
        <Card className="shadow-card border-0 border-l-4 border-l-primary">
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <p className="text-sm">A ticket has been called. <strong>Scan the user's QR code</strong> or enter the ticket number to verify check-in.</p>
          </CardContent>
        </Card>
      )}

      {/* Scanner */}
      <Card className="shadow-card border-0">
        <CardHeader>
          <CardTitle className="font-display text-lg">QR Check-in Scanner</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div id={containerId} className="w-full max-w-sm mx-auto rounded-lg overflow-hidden" />
          <div className="flex justify-center">
            {!scanning ? (
              <Button onClick={startScanner} className="gradient-primary gap-2" disabled={!calledTicketId}>
                <Camera className="h-4 w-4" /> Start Scanner
              </Button>
            ) : (
              <Button onClick={stopScanner} variant="outline" className="gap-2">
                <CameraOff className="h-4 w-4" /> Stop Scanner
              </Button>
            )}
          </div>
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">Or enter ticket number manually</p>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. SQ-1234"
                value={manualTicket}
                onChange={(e) => setManualTicket(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
                disabled={!calledTicketId}
              />
              <Button onClick={handleManualSearch} disabled={searching || !calledTicketId} variant="outline" className="gap-1">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Verify
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Result */}
      {lastResult && (
        <Card className={`shadow-card border-0 border-l-4 ${lastResult.success ? "border-l-success" : "border-l-destructive"} animate-slide-up`}>
          <CardContent className="p-4 flex items-center gap-3">
            {lastResult.success ? (
              <CheckCircle className="h-6 w-6 text-success flex-shrink-0" />
            ) : (
              <QrCode className="h-6 w-6 text-destructive flex-shrink-0" />
            )}
            <p className="text-sm font-medium">{lastResult.message}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
