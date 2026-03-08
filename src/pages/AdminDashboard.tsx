import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, BarChart3, CalendarDays, CheckCircle, Clock, FileCheck, PhoneCall, Settings, Timer, Users, XCircle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import ServiceManagement from "@/components/admin/ServiceManagement";
import SlotManagement from "@/components/admin/SlotManagement";
import StaffActivityLogs from "@/components/admin/StaffActivityLogs";
import DocumentVerificationStats from "@/components/admin/DocumentVerificationStats";
import UserManagement from "@/components/admin/UserManagement";

const statusColors: Record<string, string> = {
  waiting: "bg-warning/10 text-warning",
  called: "bg-primary/10 text-primary",
  serving: "bg-success/10 text-success",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-destructive/10 text-destructive",
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

  const filteredTickets = filterStatus === "all" ? tickets : tickets.filter((t) => t.status === filterStatus);

  const today = new Date().toDateString();
  const todayTickets = tickets.filter(t => new Date(t.created_at).toDateString() === today);
  const waitingCount = tickets.filter(t => t.status === "waiting").length;
  const calledCount = tickets.filter(t => t.status === "called").length;
  const servingCount = tickets.filter(t => t.status === "serving").length;
  const completedToday = todayTickets.filter(t => t.status === "completed").length;
  const noShowToday = todayTickets.filter(t => t.status === "no_show").length;
  const cancelledToday = todayTickets.filter(t => t.status === "cancelled").length;

  // Avg wait: for completed tickets today that have called_at and created_at
  const completedWithWait = todayTickets.filter(t => t.status === "completed" && t.called_at);
  const avgWait = completedWithWait.length > 0
    ? Math.round(
        completedWithWait.reduce((sum, t) => {
          const wait = (new Date(t.called_at!).getTime() - new Date(t.created_at).getTime()) / 60000;
          return sum + wait;
        }, 0) / completedWithWait.length
      )
    : 0;

  // Avg service time: from called_at to completed_at
  const completedWithService = todayTickets.filter(t => t.status === "completed" && t.called_at && t.completed_at);
  const avgServiceTime = completedWithService.length > 0
    ? Math.round(
        completedWithService.reduce((sum, t) => {
          const svcTime = (new Date(t.completed_at!).getTime() - new Date(t.called_at!).getTime()) / 60000;
          return sum + svcTime;
        }, 0) / completedWithService.length
      )
    : 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Queue analytics, services, and staff management</p>
        </div>
      </div>

      {/* Stats Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center"><Clock className="h-5 w-5 text-warning" /></div>
            <div><p className="text-2xl font-bold">{waitingCount}</p><p className="text-xs text-muted-foreground">Waiting</p></div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Timer className="h-5 w-5 text-primary" /></div>
            <div><p className="text-2xl font-bold">{calledCount}</p><p className="text-xs text-muted-foreground">Called</p></div>
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
      </div>

      {/* Stats Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center"><AlertTriangle className="h-5 w-5 text-destructive" /></div>
            <div><p className="text-2xl font-bold">{noShowToday}</p><p className="text-xs text-muted-foreground">No-Shows Today</p></div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center"><XCircle className="h-5 w-5 text-destructive" /></div>
            <div><p className="text-2xl font-bold">{cancelledToday}</p><p className="text-xs text-muted-foreground">Cancelled Today</p></div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><BarChart3 className="h-5 w-5 text-primary" /></div>
            <div><p className="text-2xl font-bold">{avgWait} min</p><p className="text-xs text-muted-foreground">Avg Wait Time</p></div>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center"><BarChart3 className="h-5 w-5 text-success" /></div>
            <div><p className="text-2xl font-bold">{avgServiceTime} min</p><p className="text-xs text-muted-foreground">Avg Service Time</p></div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="services"><Settings className="h-4 w-4 mr-1" />Services</TabsTrigger>
          <TabsTrigger value="slots"><CalendarDays className="h-4 w-4 mr-1" />Slots</TabsTrigger>
          <TabsTrigger value="documents"><FileCheck className="h-4 w-4 mr-1" />Documents</TabsTrigger>
          <TabsTrigger value="counters">Counters</TabsTrigger>
          <TabsTrigger value="activity">Staff Activity</TabsTrigger>
          <TabsTrigger value="users"><Users className="h-4 w-4 mr-1" />Users</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4">
          <div className="flex items-center gap-4 mb-4">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tickets</SelectItem>
                <SelectItem value="waiting">Waiting</SelectItem>
                <SelectItem value="called">Called</SelectItem>
                <SelectItem value="serving">Serving</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="no_show">No Show</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline" className="text-xs">
              {filteredTickets.length} ticket{filteredTickets.length !== 1 ? "s" : ""}
            </Badge>
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
                    <div className="text-xs text-muted-foreground">
                      {new Date(ticket.created_at).toLocaleTimeString()}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filteredTickets.length === 0 && <p className="text-center text-muted-foreground py-8">No tickets found</p>}
          </div>
        </TabsContent>

        <TabsContent value="services"><ServiceManagement /></TabsContent>
        <TabsContent value="slots"><SlotManagement /></TabsContent>
        <TabsContent value="documents"><DocumentVerificationStats /></TabsContent>

        <TabsContent value="counters">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {counters.map((c) => {
              const svc = services.find(s => s.id === c.service_id);
              return (
                <Card key={c.id} className="shadow-card border-0">
                  <CardContent className="p-4">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-sm text-muted-foreground">{svc?.name || "Unassigned"}</p>
                    <Badge variant={c.is_active ? "default" : "secondary"} className="mt-2">{c.is_active ? "Active" : "Inactive"}</Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="activity"><StaffActivityLogs /></TabsContent>
        <TabsContent value="users"><UserManagement /></TabsContent>
      </Tabs>
    </div>
  );
}
