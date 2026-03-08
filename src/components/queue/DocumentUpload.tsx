import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AlertCircle, CheckCircle, Clock, FileUp, Loader2, Upload, XCircle } from "lucide-react";

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

interface Props {
  serviceId: string;
  requiredDocuments: string[];
  onAllUploaded: (uploaded: boolean) => void;
}

export default function DocumentUpload({ serviceId, requiredDocuments, onAllUploaded }: Props) {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<Record<string, { status: string; uploading: boolean; notes?: string | null }>>({});

  const fetchUploads = () => {
    if (!user || !serviceId) return;
    supabase
      .from("document_uploads")
      .select("*")
      .eq("user_id", user.id)
      .eq("service_id", serviceId)
      .then(({ data }) => {
        const map: Record<string, { status: string; uploading: boolean; notes?: string | null }> = {};
        (data || []).forEach(d => {
          map[d.document_name] = { status: d.status, uploading: false, notes: d.notes };
        });
        setUploads(map);
      });
  };

  useEffect(() => {
    fetchUploads();

    if (!user || !serviceId) return;
    const channel = supabase
      .channel(`doc-status-${serviceId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "document_uploads",
        filter: `user_id=eq.${user.id}`,
      }, fetchUploads)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, serviceId]);

  useEffect(() => {
    const allVerified = requiredDocuments.every(doc => uploads[doc] && uploads[doc].status === "verified");
    onAllUploaded(allVerified);
  }, [uploads, requiredDocuments, onAllUploaded]);

  const validateFile = (file: File): string | null => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return `Invalid file format. Only PDF, JPG, and PNG are allowed.`;
    }
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
      return `Invalid file type. Only PDF, JPG, and PNG are allowed.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is 5MB.`;
    }
    return null;
  };

  const handleUpload = async (docName: string, file: File) => {
    if (!user) return;

    const validationError = validateFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setUploads(prev => ({ ...prev, [docName]: { status: "uploading", uploading: true } }));

    const filePath = `${user.id}/${serviceId}/${docName}-${Date.now()}.${file.name.split('.').pop()}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, file);
    if (uploadError) {
      toast.error(`Upload failed: ${uploadError.message}`);
      setUploads(prev => ({ ...prev, [docName]: { status: "error", uploading: false } }));
      return;
    }

    const { error: dbError } = await supabase.from("document_uploads").insert({
      user_id: user.id,
      service_id: serviceId,
      document_name: docName,
      file_path: filePath,
      status: "pending",
    });

    if (dbError) {
      toast.error(dbError.message);
      setUploads(prev => ({ ...prev, [docName]: { status: "error", uploading: false } }));
    } else {
      toast.success(`${docName} uploaded — awaiting staff verification`);
      setUploads(prev => ({ ...prev, [docName]: { status: "pending", uploading: false } }));
    }
  };

  const statusIcon = (status: string) => {
    if (status === "verified") return <CheckCircle className="h-4 w-4 text-success" />;
    if (status === "rejected") return <XCircle className="h-4 w-4 text-destructive" />;
    if (status === "pending") return <Clock className="h-4 w-4 text-warning" />;
    return null;
  };

  const statusLabel = (status: string) => {
    if (status === "verified") return "Approved";
    if (status === "rejected") return "Rejected";
    if (status === "pending") return "Pending Verification";
    return status;
  };

  if (requiredDocuments.length === 0) return null;

  const allPending = requiredDocuments.every(doc => uploads[doc] && uploads[doc].status === "pending");
  const allVerified = requiredDocuments.every(doc => uploads[doc] && uploads[doc].status === "verified");
  const someRejected = requiredDocuments.some(doc => uploads[doc]?.status === "rejected");

  return (
    <Card className="shadow-elevated border-0">
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Upload className="h-5 w-5" /> Required Documents
        </CardTitle>
        {allPending && (
          <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 p-2 rounded-lg">
            <Clock className="h-4 w-4" />
            All documents uploaded — awaiting staff verification
          </div>
        )}
        {allVerified && (
          <div className="flex items-center gap-2 text-sm text-success bg-success/10 p-2 rounded-lg">
            <CheckCircle className="h-4 w-4" />
            All documents verified — you can proceed
          </div>
        )}
        {someRejected && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-2 rounded-lg">
            <AlertCircle className="h-4 w-4" />
            Some documents were rejected — please re-upload
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground mb-2">Accepted formats: PDF, JPG, PNG (max 5MB each)</p>
        {requiredDocuments.map((docName) => {
          const upload = uploads[docName];
          return (
            <div key={docName} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <div className="flex-1">
                <p className="text-sm font-medium">{docName}</p>
                {upload && (
                  <div className="space-y-1 mt-1">
                    <div className="flex items-center gap-1">
                      {statusIcon(upload.status)}
                      <Badge variant="outline" className="text-xs">{statusLabel(upload.status)}</Badge>
                    </div>
                    {upload.status === "rejected" && upload.notes && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Reason: {upload.notes}
                      </p>
                    )}
                  </div>
                )}
              </div>
              {(!upload || upload.status === "rejected") && (
                <div className="relative">
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(docName, file);
                    }}
                  />
                  <Button variant="outline" size="sm" className="gap-1" disabled={upload?.uploading}>
                    {upload?.uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                    {upload?.status === "rejected" ? "Re-upload" : "Upload"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
