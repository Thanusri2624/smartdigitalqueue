import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Camera,
  CameraOff,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  Phone,
  PlayCircle,
  Search,
  User,
  XCircle,
} from "lucide-react";

interface ScannedTicket {
  id: string;
  ticket_number: string;
  status: string;
  priority: string;
  service_name: string;
  service_description: string;
  created_at: string;
  estimated_wait_minutes: number | null;
}

interface UserProfile {
  full_name: string;
  phone: string | null;
  date_of_birth: string | null;
  is_pregnant: boolean;
  is_disabled: boolean;
}

interface UserDocument {
  id: string;
  document_name: string;
  status: string;
}

export default function QrScanner() {
  const { user } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [scannedTicket, setScannedTicket] = useState<ScannedTicket | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userDocs, setUserDocs] = useState<UserDocument[]>([]);
  const [manualTicket, setManualTicket] = useState("");
  const [searching, setSearching] = useState(false);
  const [startingService, setStartingService] = useState(false);
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

  const lookupTicket = async (ticketNumber: string) => {
    const { data: ticket } = await supabase
      .from("queue_tickets")
      .select("*, services(name, description)")
      .eq("ticket_number", ticketNumber)
      .single();

    if (!ticket) {
      toast.error("Ticket not found");
      return;
    }

    // Fetch user profile
    let profile: UserProfile | null = null;
    if (ticket.user_id) {
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, phone, date_of_birth, is_pregnant, is_disabled")
        .eq("user_id", ticket.user_id)
        .single();
      if (p) profile = p;
    }

    // Fetch user documents for this service
    let docs: UserDocument[] = [];
    if (ticket.user_id) {
      const { data: d } = await supabase
        .from("document_uploads")
        .select("id, document_name, status")
        .eq("user_id", ticket.user_id)
        .eq("service_id", ticket.service_id);
      docs = d || [];
    }

    setScannedTicket({
      id: ticket.id,
      ticket_number: ticket.ticket_number,
      status: ticket.status,
      priority: ticket.priority,
      service_name: (ticket.services as any)?.name || "—",
      service_description: (ticket.services as any)?.description || "",
      created_at: ticket.created_at,
      estimated_wait_minutes: ticket.estimated_wait_minutes,
    });
    setUserProfile(profile);
    setUserDocs(docs);

    // Log activity
    if (user) {
      await supabase.from("staff_activity_logs").insert({
        staff_id: user.id,
        action: "scanned_qr",
        ticket_id: ticket.id,
        details: { ticket_number: ticket.ticket_number, message: `Scanned/searched ${ticket.ticket_number}` },
      });
    }
  };

  const handleScan = async (data: string) => {
    try {
      const parsed = JSON.parse(data);
      const ticketNumber = parsed.ticket;
      if (!ticketNumber) throw new Error("Invalid QR");
      await lookupTicket(ticketNumber);
    } catch {
      toast.error("Invalid QR code");
    }
  };

  const handleManualSearch = async () => {
    if (!manualTicket.trim()) return;
    setSearching(true);
    await lookupTicket(manualTicket.trim().toUpperCase());
    setManualTicket("");
    setSearching(false);
  };

  const startServing = async () => {
    if (!scannedTicket || !user) return;
    setStartingService(true);

    const { error } = await supabase.from("queue_tickets").update({
      status: "serving",
      called_at: new Date().toISOString(),
    }).eq("id", scannedTicket.id);

    if (error) { toast.error(error.message); setStartingService(false); return; }

    // Notify user
    const { data: ticket } = await supabase.from("queue_tickets").select("user_id").eq("id", scannedTicket.id).single();
    if (ticket?.user_id) {
      await supabase.from("notifications").insert({
        user_id: ticket.user_id,
        title: "It's Your Turn!",
        message: `Your ticket ${scannedTicket.ticket_number} is now being served. Please proceed to the counter.`,
        ticket_id: scannedTicket.id,
      });
    }

    await supabase.from("staff_activity_logs").insert({
      staff_id: user.id,
      action: "started_serving",
      ticket_id: scannedTicket.id,
      details: { ticket_number: scannedTicket.ticket_number, message: `Started serving ${scannedTicket.ticket_number}` },
    });

    toast.success(`Now serving ${scannedTicket.ticket_number}`);
    setScannedTicket(prev => prev ? { ...prev, status: "serving" } : null);
    setStartingService(false);
  };

  const markCompleted = async () => {
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
      details: { ticket_number: scannedTicket.ticket_number, message: `Completed ${scannedTicket.ticket_number}` },
    });

    toast.success(`${scannedTicket.ticket_number} marked as completed`);
    setScannedTicket(prev => prev ? { ...prev, status: "completed" } : null);
  };

  const clearTicket = () => {
    setScannedTicket(null);
    setUserProfile(null);
    setUserDocs([]);
  };

  const statusColors: Record<string, string> = {
    waiting: "bg-warning/10 text-warning",
    serving: "bg-success/10 text-success",
    completed: "bg-muted text-muted-foreground",
    cancelled: "bg-destructive/10 text-destructive",
  };

  const docStatusColors: Record<string, string> = {
    pending: "bg-warning/10 text-warning",
    verified: "bg-success/10 text-success",
    rejected: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="space-y-4">
      {/* Scanner Card */}
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
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">Or search by ticket number</p>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. SQ-1234"
                value={manualTicket}
                onChange={(e) => setManualTicket(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
              />
              <Button onClick={handleManualSearch} disabled={searching} variant="outline" className="gap-1">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scanned Ticket Details */}
      {scannedTicket && (
        <Card className="shadow-elevated border-0 animate-slide-up">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="font-display text-lg">Ticket Details</CardTitle>
              <Button variant="ghost" size="sm" onClick={clearTicket} className="text-muted-foreground">
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Ticket Info */}
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl gradient-primary flex items-center justify-center">
                <span className="text-primary-foreground font-display font-bold text-sm">{scannedTicket.ticket_number}</span>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-lg">{scannedTicket.ticket_number}</p>
                <div className="flex gap-2 mt-1">
                  <Badge variant="outline" className={statusColors[scannedTicket.status]}>{scannedTicket.status}</Badge>
                  <Badge variant="outline">{scannedTicket.priority}</Badge>
                </div>
              </div>
            </div>

            <Separator />

            {/* Reason / Service */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reason for Visit</p>
              <p className="font-semibold text-base">{scannedTicket.service_name}</p>
              {scannedTicket.service_description && (
                <p className="text-sm text-muted-foreground">{scannedTicket.service_description}</p>
              )}
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Clock className="h-3 w-3" />
                Est. {scannedTicket.estimated_wait_minutes ?? "—"} min • Joined {new Date(scannedTicket.created_at).toLocaleTimeString()}
              </div>
            </div>

            <Separator />

            {/* User Profile */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">User Information</p>
              {userProfile ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{userProfile.full_name || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{userProfile.phone || "Not provided"}</span>
                  </div>
                  {userProfile.date_of_birth && (
                    <div className="col-span-2 text-muted-foreground">
                      DOB: {new Date(userProfile.date_of_birth).toLocaleDateString()}
                    </div>
                  )}
                  <div className="col-span-2 flex gap-2">
                    {userProfile.is_pregnant && <Badge variant="outline" className="bg-pink-500/10 text-pink-600">Pregnant</Badge>}
                    {userProfile.is_disabled && <Badge variant="outline" className="bg-blue-500/10 text-blue-600">Disabled</Badge>}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No profile found</p>
              )}
            </div>

            {/* Documents */}
            {userDocs.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Uploaded Documents</p>
                  <div className="space-y-1">
                    {userDocs.map((doc) => (
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
                </div>
              </>
            )}

            <Separator />

            {/* Action Buttons */}
            {scannedTicket.status === "waiting" && (
              <Button
                onClick={startServing}
                disabled={startingService}
                className="w-full gap-2 gradient-primary text-lg py-6"
              >
                {startingService ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <PlayCircle className="h-5 w-5" />
                )}
                Start Serving
              </Button>
            )}

            {scannedTicket.status === "serving" && (
              <Button
                onClick={markCompleted}
                className="w-full gap-2 bg-success hover:bg-success/90 text-success-foreground text-lg py-6"
              >
                <CheckCircle className="h-5 w-5" /> Mark as Completed
              </Button>
            )}

            {scannedTicket.status === "completed" && (
              <div className="flex items-center justify-center gap-2 text-success py-3">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Service completed</span>
              </div>
            )}

            {scannedTicket.status === "cancelled" && (
              <div className="flex items-center justify-center gap-2 text-destructive py-3">
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
