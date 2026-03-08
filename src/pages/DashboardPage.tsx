import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CalendarDays, CheckCircle, Clock, FileText, Loader2, Plus, QrCode, Ticket, Users, XCircle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import SlotBooking from "@/components/queue/SlotBooking";
import { toast } from "sonner";
import { format } from "date-fns";

const priorityColors: Record<string, string> = {
  normal: "bg-primary/10 text-primary",
  senior: "bg-warning/10 text-warning",
  pregnant: "bg-priority-pregnant/10 text-priority-pregnant",
  disabled: "bg-priority-disabled/10 text-priority-disabled",
  emergency: "bg-destructive/10 text-destructive",
};

const statusColors: Record<string, string> = {
  waiting: "bg-warning/10 text-warning",
  serving: "bg-success/10 text-success",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-muted text-muted-foreground",
};

interface ServiceWithDocs {
  serviceId: string;
  serviceName: string;
  slotsEnabled: boolean;
  requiredDocs: string[];
  allVerified: boolean;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Tables<"queue_tickets">[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [servicesWithDocs, setServicesWithDocs] = useState<ServiceWithDocs[]>([]);
  const [slotBookedServices, setSlotBookedServices] = useState<Set<string>>(new Set());
  const [slotBookings, setSlotBookings] = useState<any[]>([]);
  const [cancellingBooking, setCancellingBooking] = useState<string | null>(null);

  const fetchTickets = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("queue_tickets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    setTickets(data || []);
    setLoading(false);
  };

  const fetchDocuments = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("document_uploads")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    setDocuments(data || []);
  };

  const fetchServicesForBooking = async () => {
    if (!user) return;
    // Get all services that have slots enabled
    const { data: services } = await supabase
      .from("services")
      .select("*")
      .eq("is_active", true)
      .eq("slots_enabled", true);

    if (!services || services.length === 0) {
      setServicesWithDocs([]);
      return;
    }

    // Get user's document uploads
    const { data: userDocs } = await supabase
      .from("document_uploads")
      .select("*")
      .eq("user_id", user.id);

    // Get user's existing slot bookings with slot details
    const { data: bookings } = await supabase
      .from("slot_bookings")
      .select("*, service_slots(service_id, slot_date, slot_time, booked_count)")
      .eq("user_id", user.id)
      .eq("status", "booked");

    setSlotBookings(bookings || []);
    const bookedServiceIds = new Set(
      (bookings || []).map((b: any) => b.service_slots?.service_id).filter(Boolean)
    );
    setSlotBookedServices(bookedServiceIds);

    const result: ServiceWithDocs[] = services.map(svc => {
      const requiredDocs: string[] = (svc.required_documents as string[]) || [];
      const allVerified = requiredDocs.length === 0 || requiredDocs.every(docName =>
        (userDocs || []).some(d => d.service_id === svc.id && d.document_name === docName && d.status === "verified")
      );
      return {
        serviceId: svc.id,
        serviceName: svc.name,
        slotsEnabled: true,
        requiredDocs,
        allVerified,
      };
    });

    setServicesWithDocs(result);
  };

  useEffect(() => {
    fetchTickets();
    fetchDocuments();
    fetchServicesForBooking();

    if (!user) return;
    const channel = supabase
      .channel("user-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_tickets", filter: `user_id=eq.${user.id}` }, fetchTickets)
      .on("postgres_changes", { event: "*", schema: "public", table: "document_uploads", filter: `user_id=eq.${user.id}` }, () => { fetchDocuments(); fetchServicesForBooking(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const activeTickets = tickets.filter((t) => t.status === "waiting" || t.status === "serving");
  const pastTickets = tickets.filter((t) => t.status !== "waiting" && t.status !== "serving");

  const pendingDocs = documents.filter(d => d.status === "pending");
  const rejectedDocs = documents.filter(d => d.status === "rejected");
  const verifiedDocs = documents.filter(d => d.status === "verified");

  // Services ready for slot booking (docs verified, not already booked)
  const bookableServices = servicesWithDocs.filter(s => s.allVerified && !slotBookedServices.has(s.serviceId));

  const handleSlotBooked = (serviceId: string, ticketId: string) => {
    setSlotBookedServices(prev => new Set([...prev, serviceId]));
    toast.success("Slot booked! Redirecting to your ticket...");
    navigate(`/ticket/${ticketId}`);
  };

  const handleCancelBooking = async (booking: any) => {
    if (!user) return;
    setCancellingBooking(booking.id);

    try {
      // Cancel the slot booking
      await supabase.from("slot_bookings").update({ status: "cancelled" }).eq("id", booking.id);

      // Decrement booked_count on the slot
      if (booking.service_slots?.booked_count > 0) {
        await supabase.from("service_slots").update({ 
          booked_count: booking.service_slots.booked_count - 1 
        }).eq("id", booking.slot_id);
      }

      // Cancel associated ticket if exists
      if (booking.ticket_id) {
        await supabase.from("queue_tickets").update({ status: "cancelled" }).eq("id", booking.ticket_id);
      }

      toast.success("Slot booking cancelled");
      fetchTickets();
      fetchServicesForBooking();
    } catch (err) {
      toast.error("Failed to cancel booking");
    }
    setCancellingBooking(null);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Manage your queue tickets & documents</p>
        </div>
        <Link to="/join-queue">
          <Button className="gradient-primary gap-2">
            <Plus className="h-4 w-4" />
            Join Queue
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Ticket className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{tickets.length}</p>
              <p className="text-xs text-muted-foreground">Total Tickets</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeTickets.length}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pastTickets.filter(t => t.status === 'completed').length}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{documents.length}</p>
              <p className="text-xs text-muted-foreground">Documents</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Document Verification Status */}
      {documents.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-display font-semibold mb-4">Document Status</h2>
          {pendingDocs.length > 0 && (
            <Card className="shadow-card border-0 mb-3">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-warning" />
                  <p className="font-medium text-sm text-warning">Pending Verification ({pendingDocs.length})</p>
                </div>
                <div className="space-y-1">
                  {pendingDocs.map(doc => (
                    <p key={doc.id} className="text-xs text-muted-foreground">• {doc.document_name}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {rejectedDocs.length > 0 && (
            <Card className="shadow-card border-0 border-l-4 border-l-destructive mb-3">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <p className="font-medium text-sm text-destructive">Rejected ({rejectedDocs.length})</p>
                </div>
                <div className="space-y-2">
                  {rejectedDocs.map(doc => (
                    <div key={doc.id}>
                      <p className="text-xs font-medium">{doc.document_name}</p>
                      {doc.notes && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {doc.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <Link to="/join-queue">
                  <Button size="sm" variant="outline" className="mt-3 gap-1">
                    <Plus className="h-3 w-3" /> Re-upload Documents
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
          {verifiedDocs.length > 0 && (
            <Card className="shadow-card border-0 mb-3">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <p className="font-medium text-sm text-success">Approved ({verifiedDocs.length})</p>
                </div>
                <div className="space-y-1">
                  {verifiedDocs.map(doc => (
                    <p key={doc.id} className="text-xs text-muted-foreground">• {doc.document_name}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Slot Booking Section - shown when user has verified docs for slot-enabled services */}
      {bookableServices.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-display font-semibold mb-4 flex items-center gap-2">
            <CalendarDays className="h-5 w-5" /> Book a Slot
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Your documents are verified. You can now book a slot for the following services:
          </p>
          <div className="space-y-4">
            {bookableServices.map(svc => (
              <div key={svc.serviceId}>
                <p className="font-medium text-sm mb-2">{svc.serviceName}</p>
                <SlotBooking
                  serviceId={svc.serviceId}
                  onSlotBooked={() => handleSlotBooked(svc.serviceId)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Slot Bookings with cancel option */}
      {slotBookings.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-display font-semibold mb-4 flex items-center gap-2">
            <CalendarDays className="h-5 w-5" /> Your Slot Bookings
          </h2>
          <div className="space-y-3">
            {slotBookings.map(booking => {
              const svc = servicesWithDocs.find(s => s.serviceId === booking.service_slots?.service_id);
              return (
                <Card key={booking.id} className="shadow-card border-0">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <CalendarDays className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{svc?.serviceName || "Service"}</p>
                        <p className="text-xs text-muted-foreground">
                          {booking.service_slots?.slot_date && format(new Date(booking.service_slots.slot_date), "EEE, MMM d")}
                          {" at "}
                          {booking.service_slots?.slot_time?.slice(0, 5)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-success/10 text-success">Booked</Badge>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-destructive hover:text-destructive gap-1"
                        disabled={cancellingBooking === booking.id}
                        onClick={() => handleCancelBooking(booking)}
                      >
                        {cancellingBooking === booking.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <><XCircle className="h-3 w-3" /> Cancel</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Tickets */}
      {activeTickets.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-display font-semibold mb-4">Active Tickets</h2>
          <div className="space-y-3">
            {activeTickets.map((ticket) => (
              <Link key={ticket.id} to={`/ticket/${ticket.id}`}>
                <Card className="shadow-card border-0 hover:shadow-elevated transition-shadow cursor-pointer animate-slide-up">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg gradient-primary flex items-center justify-center">
                        <span className="text-primary-foreground font-display font-bold text-sm">{ticket.ticket_number}</span>
                      </div>
                      <div>
                        <p className="font-medium">{ticket.ticket_number}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className={priorityColors[ticket.priority]}>
                            {ticket.priority}
                          </Badge>
                          <Badge variant="outline" className={statusColors[ticket.status]}>
                            {ticket.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {ticket.estimated_wait_minutes != null && (
                        <p className="text-sm text-muted-foreground">
                          ~{ticket.estimated_wait_minutes} min wait
                        </p>
                      )}
                      {ticket.position != null && (
                        <p className="text-xs text-muted-foreground">Position: #{ticket.position}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Past Tickets */}
      {pastTickets.length > 0 && (
        <div>
          <h2 className="text-xl font-display font-semibold mb-4">History</h2>
          <div className="space-y-2">
            {pastTickets.map((ticket) => (
              <Link key={ticket.id} to={`/ticket/${ticket.id}`}>
                <Card className="shadow-card border-0 hover:shadow-elevated transition-shadow cursor-pointer opacity-80">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-medium">{ticket.ticket_number}</span>
                      <Badge variant="outline" className={statusColors[ticket.status]}>{ticket.status}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!loading && tickets.length === 0 && documents.length === 0 && (
        <Card className="shadow-card border-0">
          <CardContent className="p-12 text-center">
            <Ticket className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-display font-semibold mb-2">No tickets yet</h3>
            <p className="text-muted-foreground mb-4">Join a queue to get started</p>
            <Link to="/join-queue">
              <Button className="gradient-primary gap-2">
                <Plus className="h-4 w-4" />
                Join Queue
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
