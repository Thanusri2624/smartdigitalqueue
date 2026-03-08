import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, UserCog } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface StaffProfile {
  user_id: string;
  full_name: string;
  role: string;
}

interface StaffAssignment {
  id: string;
  staff_id: string;
  service_id: string;
  staff_name?: string;
  service_name?: string;
}

export default function StaffServiceAssignment() {
  const [services, setServices] = useState<Tables<"services">[]>([]);
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [selectedStaff, setSelectedStaff] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    const [svcRes, rolesRes, assignRes] = await Promise.all([
      supabase.from("services").select("*").eq("is_active", true),
      supabase.from("user_roles").select("user_id, role").in("role", ["staff", "admin"]),
      supabase.from("staff_services").select("*"),
    ]);

    setServices(svcRes.data || []);

    const staffUserIds = (rolesRes.data || []).map(r => r.user_id);
    if (staffUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", staffUserIds);
      setStaffList(
        (profiles || []).map(p => ({
          user_id: p.user_id,
          full_name: p.full_name || "Unnamed",
          role: (rolesRes.data || []).find(r => r.user_id === p.user_id)?.role || "staff",
        }))
      );
    }

    const assignData = assignRes.data || [];
    setAssignments(assignData.map(a => ({ ...a } as StaffAssignment)));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getStaffName = (staffId: string) =>
    staffList.find(s => s.user_id === staffId)?.full_name || staffId.slice(0, 8);

  const getServiceName = (serviceId: string) =>
    services.find(s => s.id === serviceId)?.name || "Unknown";

  const handleAssign = async () => {
    if (!selectedStaff || !selectedService) {
      toast.error("Select both staff and service");
      return;
    }
    const exists = assignments.some(a => a.staff_id === selectedStaff && a.service_id === selectedService);
    if (exists) {
      toast.error("This assignment already exists");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("staff_services").insert({
      staff_id: selectedStaff,
      service_id: selectedService,
    });
    if (error) {
      toast.error("Failed to assign: " + error.message);
    } else {
      toast.success("Service assigned to staff");
      setSelectedStaff("");
      setSelectedService("");
      fetchData();
    }
    setLoading(false);
  };

  const handleRemove = async (id: string) => {
    const { error } = await supabase.from("staff_services").delete().eq("id", id);
    if (error) {
      toast.error("Failed to remove: " + error.message);
    } else {
      toast.success("Assignment removed");
      fetchData();
    }
  };

  // Group assignments by staff
  const groupedByStaff = staffList.map(staff => ({
    ...staff,
    services: assignments
      .filter(a => a.staff_id === staff.user_id)
      .map(a => ({ assignmentId: a.id, serviceId: a.service_id, serviceName: getServiceName(a.service_id) })),
  }));

  return (
    <div className="space-y-6">
      <Card className="shadow-card border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Assign Services to Staff
          </CardTitle>
          <CardDescription>Each staff member will only see their assigned service queues.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Staff Member</label>
              <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                <SelectTrigger><SelectValue placeholder="Select staff..." /></SelectTrigger>
                <SelectContent>
                  {staffList.map(s => (
                    <SelectItem key={s.user_id} value={s.user_id}>
                      {s.full_name} <Badge variant="outline" className="ml-2 text-xs">{s.role}</Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Service</label>
              <Select value={selectedService} onValueChange={setSelectedService}>
                <SelectTrigger><SelectValue placeholder="Select service..." /></SelectTrigger>
                <SelectContent>
                  {services.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAssign} disabled={loading} className="gradient-primary gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Assign
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groupedByStaff.map(staff => (
          <Card key={staff.user_id} className="shadow-card border-0">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center">
                  <span className="text-primary-foreground font-bold text-xs">{staff.full_name.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <p className="font-medium text-sm">{staff.full_name}</p>
                  <Badge variant="outline" className="text-xs">{staff.role}</Badge>
                </div>
              </div>
              {staff.services.length === 0 ? (
                <p className="text-xs text-muted-foreground">No services assigned</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {staff.services.map(svc => (
                    <Badge key={svc.assignmentId} variant="secondary" className="gap-1 pr-1">
                      {svc.serviceName}
                      <button
                        onClick={() => handleRemove(svc.assignmentId)}
                        className="ml-1 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {staffList.length === 0 && (
          <p className="text-muted-foreground col-span-2 text-center py-8">No staff members found. Create staff accounts first.</p>
        )}
      </div>
    </div>
  );
}
