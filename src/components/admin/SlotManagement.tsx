import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarDays, Edit2, Loader2, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";

const emptyForm = { service_id: "", slot_date: "", slot_time: "", end_time: "", max_tokens: 10 };

export default function SlotManagement() {
  const [services, setServices] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState<any>(null);

  const fetchData = async () => {
    const [sRes, slRes] = await Promise.all([
      supabase.from("services").select("*").eq("slots_enabled", true),
      supabase.from("service_slots").select("*, services(name)").order("slot_date", { ascending: true }).order("slot_time", { ascending: true }),
    ]);
    setServices(sRes.data || []);
    setSlots(slRes.data || []);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!form.service_id || !form.slot_date || !form.slot_time) {
      toast.error("All fields are required");
      return;
    }
    setLoading(true);
    if (!form.end_time) {
      toast.error("All fields are required");
      return;
    }
    const { error } = await supabase.from("service_slots").insert({
      service_id: form.service_id,
      slot_date: form.slot_date,
      slot_time: form.slot_time,
      end_time: form.end_time,
      max_tokens: form.max_tokens,
    });
    if (error) toast.error(error.message);
    else { toast.success("Slot created"); setDialogOpen(false); setForm(emptyForm); fetchData(); }
    setLoading(false);
  };

  const handleEdit = async () => {
    if (!editForm) return;
    setLoading(true);
    const { error } = await supabase.from("service_slots").update({
      slot_date: editForm.slot_date,
      slot_time: editForm.slot_time,
      end_time: editForm.end_time,
      max_tokens: editForm.max_tokens,
      is_active: editForm.is_active,
    }).eq("id", editForm.id);
    if (error) toast.error(error.message);
    else { toast.success("Slot updated"); setEditDialogOpen(false); setEditForm(null); fetchData(); }
    setLoading(false);
  };

  const openEdit = (slot: any) => {
    setEditForm({
      id: slot.id,
      slot_date: slot.slot_date,
      slot_time: slot.slot_time?.slice(0, 5),
      end_time: slot.end_time?.slice(0, 5) || "",
      max_tokens: slot.max_tokens,
      is_active: slot.is_active,
      booked_count: slot.booked_count,
      service_name: (slot.services as any)?.name || "—",
    });
    setEditDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("service_slots").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Slot deleted"); fetchData(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-semibold">Service Slots</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gradient-primary gap-1"><Plus className="h-4 w-4" /> Add Slot</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">Create Slot</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Service</Label>
                <Select value={form.service_id} onValueChange={(v) => setForm(f => ({ ...f, service_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                  <SelectContent>
                    {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={form.slot_date} onChange={(e) => setForm(f => ({ ...f, slot_date: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input type="time" value={form.slot_time} onChange={(e) => setForm(f => ({ ...f, slot_time: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input type="time" value={form.end_time} onChange={(e) => setForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Max Tokens</Label>
                <Input type="number" min={1} value={form.max_tokens} onChange={(e) => setForm(f => ({ ...f, max_tokens: parseInt(e.target.value) || 10 }))} />
              </div>
              <Button onClick={handleCreate} disabled={loading} className="w-full gradient-primary">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create Slot
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Edit Slot — {editForm?.service_name}</DialogTitle></DialogHeader>
          {editForm && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={editForm.slot_date} onChange={(e) => setEditForm((f: any) => ({ ...f, slot_date: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Time</Label>
                  <Input type="time" value={editForm.slot_time} onChange={(e) => setEditForm((f: any) => ({ ...f, slot_time: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Max Tokens</Label>
                <Input
                  type="number"
                  min={editForm.booked_count || 1}
                  value={editForm.max_tokens}
                  onChange={(e) => setEditForm((f: any) => ({ ...f, max_tokens: parseInt(e.target.value) || 10 }))}
                />
                {editForm.booked_count > 0 && (
                  <p className="text-xs text-muted-foreground">{editForm.booked_count} already booked — minimum is {editForm.booked_count}</p>
                )}
              </div>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch checked={editForm.is_active} onCheckedChange={(v) => setEditForm((f: any) => ({ ...f, is_active: v }))} />
              </div>
              <Button onClick={handleEdit} disabled={loading} className="w-full gradient-primary">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="space-y-2">
        {slots.map((slot) => (
          <Card key={slot.id} className="shadow-card border-0">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <CalendarDays className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{(slot.services as any)?.name || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(slot.slot_date), "MMM d, yyyy")} at {slot.slot_time?.slice(0, 5)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!slot.is_active && <Badge variant="outline" className="text-destructive border-destructive/30">Inactive</Badge>}
                <Badge variant="outline">{slot.booked_count}/{slot.max_tokens} booked</Badge>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(slot)}>
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(slot.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {slots.length === 0 && <p className="text-muted-foreground text-center py-8">No slots created yet.</p>}
      </div>
    </div>
  );
}
