import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { BarChart3, CalendarDays, CheckCircle, Clock, PhoneCall, Settings, Users, XCircle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import ServiceManagement from "@/components/admin/ServiceManagement";
import SlotManagement from "@/components/admin/SlotManagement";
import StaffActivityLogs from "@/components/admin/StaffActivityLogs";

const statusColors: Record<string, string> = {
  waiting: "bg-warning/10 text-warning",
  serving: "bg-success/10 text-success",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-muted text-muted-foreground",
};

const priorityOrder: Record<string, number> = {
  emergency: 0, senior: 1, pregnant: 1, disabled: 1, normal: 2,
};

export default function AdminDashboard() {
  const [tickets, setTickets] = useState<Tables<"queue_tickets">[]>([]);
  const [services, setServices] = useState<Tables<"services">[]>([]);
  const [counters, setCounters] = useState<Tables<"counters">[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const fetchAll = async () => {
    const [t, s, c] = await Promise.all([
      supabase.from("queue_tickets").select("*").order("created_at", { ascending: false }),
      supabase.from("services").select("*"),
      supabase.from("counters").select("*"),
    ]);
    setTickets(t.data || []);
    setServices(s.data || []);
    setCounters(c.data || []);
  };

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel("admin-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_tickets" }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const updateStatus = async (ticketId: string, status: string) => {
    const updateData: Record<string, any> = { status };
    if (status === "serving") updateData.called_at = new Date().toISOString();
    if (status === "completed") updateData.completed_at = new Date().toISOString();
    const { error } = await supabase.from("queue_tickets").update(updateData).eq("id", ticketId);
    if (error) toast.error(error.message);
    else toast.success(`Ticket updated to ${status}`);
  };

  const callNext = async (serviceId?: string) => {
    let query = supabase.from("queue_tickets").select("*").eq("status", "waiting");
    if (serviceId) query = query.eq("service_id", serviceId);
    const { data } = await query;
    if (!data || data.length === 0) { toast.info("No tickets waiting"); return; }
    const sorted = data.sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 2;
      const pb = priorityOrder[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    const next = sorted[0];
    await updateStatus(next.id, "serving");
    if (next.user_id) {
      await supabase.from("notifications").insert({
        user_id: next.user_id,
        title: "It's Your Turn!",
        message: `Your ticket ${next.ticket_number} is now being called. Please proceed to the counter.`,
        ticket_id: next.id,
      });
    }
  };

  const filteredTickets = filterStatus === "all" ? tickets : tickets.filter((t) => t.status === filterStatus);
  const waitingCount = tickets.filter((t) => t.status === "waiting").length;
  const servingCount = tickets.filter((t) => t.status === "serving").length;
  const completedToday = tickets.filter(
    (t) => t.status === "completed" && new Date(t.created_at).toDateString() === new Date().toDateString()
  ).length;
  const avgWait = tickets
    .filter((t) => t.estimated_wait_minutes != null)
    .reduce((sum, t) => sum + (t.estimated_wait_minutes || 0), 0) / (tickets.filter((t) => t.estimated_wait_minutes != null).length || 1);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage queues, services, staff, and analytics</p>
        </div>
        <Button className="gradient-primary gap-2" onClick={() => callNext()}>
          <PhoneCall className="h-4 w-4" /> Call Next
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center"><Clock className="h-5 w-5 text-warning" /></div>
            <div><p className="text-2xl font-bold">{waitingCount}</p><p className="text-xs text-muted-foreground">Waiting</p></div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center"><Users className="h-5 w-5 text-success" /></div>
            <div><p className="text-2xl font-bold">{servingCount}</p><p className="text-xs text-muted-foreground">Serving</p></div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><CheckCircle className="h-5 w-5 text-primary" /></div>
            <div><p className="text-2xl font-bold">{completedToday}</p><p className="text-xs text-muted-foreground">Completed Today</p></div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><BarChart3 className="h-5 w-5 text-primary" /></div>
            <div><p className="text-2xl font-bold">{Math.round(avgWait)}</p><p className="text-xs text-muted-foreground">Avg Wait (min)</p></div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="services"><Settings className="h-4 w-4 mr-1" />Services</TabsTrigger>
          <TabsTrigger value="slots"><CalendarDays className="h-4 w-4 mr-1" />Slots</TabsTrigger>
          <TabsTrigger value="counters">Counters</TabsTrigger>
          <TabsTrigger value="activity">Staff Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4">
          <div className="flex items-center gap-4 mb-4">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tickets</SelectItem>
                <SelectItem value="waiting">Waiting</SelectItem>
                <SelectItem value="serving">Serving</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            {filteredTickets.map((ticket) => {
              const svc = services.find(s => s.id === ticket.service_id);
              return (
                <Card key={ticket.id} className="shadow-card border-0">
                  <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
                        <span className="text-primary-foreground font-display font-bold text-xs">{ticket.ticket_number}</span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">{ticket.ticket_number}</p>
                        <p className="text-xs text-muted-foreground">{svc?.name || "—"}</p>
                      </div>
                      <Badge variant="outline" className={statusColors[ticket.status]}>{ticket.status}</Badge>
                      <Badge variant="outline">{ticket.priority}</Badge>
                    </div>
                    <div className="flex gap-2">
                      {ticket.status === "waiting" && (
                        <Button size="sm" variant="outline" className="gap-1 text-success" onClick={() => updateStatus(ticket.id, "serving")}>
                          <PhoneCall className="h-3 w-3" /> Call
                        </Button>
                      )}
                      {ticket.status === "serving" && (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => updateStatus(ticket.id, "completed")}>
                          <CheckCircle className="h-3 w-3" /> Complete
                        </Button>
                      )}
                      {(ticket.status === "waiting" || ticket.status === "serving") && (
                        <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => updateStatus(ticket.id, "cancelled")}>
                          <XCircle className="h-3 w-3" /> Cancel
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filteredTickets.length === 0 && <p className="text-center text-muted-foreground py-8">No tickets found</p>}
          </div>
        </TabsContent>

        <TabsContent value="services">
          <ServiceManagement />
        </TabsContent>

        <TabsContent value="slots">
          <SlotManagement />
        </TabsContent>

        <TabsContent value="counters">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {counters.map((c) => {
              const svc = services.find(s => s.id === c.service_id);
              return (
                <Card key={c.id} className="shadow-card border-0">
                  <CardContent className="p-4">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-sm text-muted-foreground">{svc?.name || "Unassigned"}</p>
                    <Badge variant={c.is_active ? "default" : "secondary"} className="mt-2">
                      {c.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <StaffActivityLogs />
        </TabsContent>
      </Tabs>
    </div>
  );
}
