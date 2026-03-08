import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Edit, Loader2, Plus, Trash2, X } from "lucide-react";

interface ServiceForm {
  name: string;
  description: string;
  estimated_time_minutes: number;
  is_active: boolean;
  required_documents: string[];
  max_queue_capacity: number;
  slots_enabled: boolean;
}

const emptyForm: ServiceForm = {
  name: "",
  description: "",
  estimated_time_minutes: 10,
  is_active: true,
  required_documents: [],
  max_queue_capacity: 100,
  slots_enabled: false,
};

export default function ServiceManagement() {
  const [services, setServices] = useState<any[]>([]);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newDoc, setNewDoc] = useState("");

  const fetchServices = async () => {
    const { data } = await supabase.from("services").select("*").order("created_at", { ascending: false });
    setServices(data || []);
  };

  useEffect(() => { fetchServices(); }, []);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Service name is required"); return; }
    setLoading(true);

    const payload = {
      name: form.name,
      description: form.description || null,
      estimated_time_minutes: form.estimated_time_minutes,
      is_active: form.is_active,
      required_documents: form.required_documents,
      max_queue_capacity: form.max_queue_capacity,
      slots_enabled: form.slots_enabled,
    };

    if (editId) {
      const { error } = await supabase.from("services").update(payload).eq("id", editId);
      if (error) toast.error(error.message);
      else toast.success("Service updated");
    } else {
      const { error } = await supabase.from("services").insert(payload);
      if (error) toast.error(error.message);
      else toast.success("Service created");
    }

    setLoading(false);
    setDialogOpen(false);
    setForm(emptyForm);
    setEditId(null);
    fetchServices();
  };

  const handleEdit = (s: any) => {
    setForm({
      name: s.name,
      description: s.description || "",
      estimated_time_minutes: s.estimated_time_minutes,
      is_active: s.is_active,
      required_documents: s.required_documents || [],
      max_queue_capacity: s.max_queue_capacity || 100,
      slots_enabled: s.slots_enabled || false,
    });
    setEditId(s.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this service? This action cannot be undone.")) return;
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Service deleted"); fetchServices(); }
  };

  const addDocument = () => {
    if (!newDoc.trim()) return;
    setForm(f => ({ ...f, required_documents: [...f.required_documents, newDoc.trim()] }));
    setNewDoc("");
  };

  const removeDocument = (idx: number) => {
    setForm(f => ({ ...f, required_documents: f.required_documents.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-display font-semibold">Services</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={async () => {
              const svcWithoutSlots = services.filter(s => !s.slots_enabled);
              if (svcWithoutSlots.length === 0) { toast.info("All services already have slots enabled"); return; }
              const { error } = await supabase.from("services").update({ slots_enabled: true }).in("id", svcWithoutSlots.map(s => s.id));
              if (error) toast.error(error.message);
              else { toast.success(`Slot booking enabled for ${svcWithoutSlots.length} service(s)`); fetchServices(); }
            }}
          >
            <CalendarDays className="h-4 w-4" /> Enable All Slots
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setForm(emptyForm); setEditId(null); } }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gradient-primary gap-1">
                <Plus className="h-4 w-4" /> Add Service
              </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">{editId ? "Edit Service" : "New Service"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Service Name *</Label>
                <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Passport Service" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of the service" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Est. Time (minutes)</Label>
                  <Input type="number" min={1} value={form.estimated_time_minutes} onChange={(e) => setForm(f => ({ ...f, estimated_time_minutes: parseInt(e.target.value) || 10 }))} />
                </div>
                <div className="space-y-2">
                  <Label>Max Queue Capacity</Label>
                  <Input type="number" min={1} value={form.max_queue_capacity} onChange={(e) => setForm(f => ({ ...f, max_queue_capacity: parseInt(e.target.value) || 100 }))} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Enable Slot Booking</Label>
                <Switch checked={form.slots_enabled} onCheckedChange={(v) => setForm(f => ({ ...f, slots_enabled: v }))} />
              </div>
              <div className="space-y-2">
                <Label>Required Documents</Label>
                <div className="flex gap-2">
                  <Input value={newDoc} onChange={(e) => setNewDoc(e.target.value)} placeholder="e.g., Identity Proof" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDocument())} />
                  <Button type="button" variant="outline" size="sm" onClick={addDocument}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.required_documents.map((doc, i) => (
                    <Badge key={i} variant="secondary" className="gap-1 pr-1">
                      {doc}
                      <button onClick={() => removeDocument(i)} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
              </div>
              <Button onClick={handleSave} disabled={loading} className="w-full gradient-primary">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editId ? "Update Service" : "Create Service"}
              </Button>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {services.map((s) => (
          <Card key={s.id} className="shadow-card border-0">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Badge variant="outline" className="text-xs">~{s.estimated_time_minutes} min</Badge>
                    <Badge variant="outline" className="text-xs">Cap: {s.max_queue_capacity || 100}</Badge>
                    {s.slots_enabled && <Badge variant="outline" className="text-xs bg-primary/10 text-primary">Slots</Badge>}
                  </div>
                  {(s.required_documents as string[] || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(s.required_documents as string[]).map((doc: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">{doc}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant={s.is_active ? "default" : "secondary"}>{s.is_active ? "Active" : "Inactive"}</Badge>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(s)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(s.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {services.length === 0 && (
          <p className="text-muted-foreground col-span-2 text-center py-8">No services yet. Add one to get started.</p>
        )}
      </div>
    </div>
  );
}
