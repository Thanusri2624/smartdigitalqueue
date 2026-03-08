import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CheckCircle, FileUp, Loader2, Upload, XCircle } from "lucide-react";

interface Props {
  serviceId: string;
  requiredDocuments: string[];
  onAllUploaded: (uploaded: boolean) => void;
}

export default function DocumentUpload({ serviceId, requiredDocuments, onAllUploaded }: Props) {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<Record<string, { status: string; uploading: boolean }>>({});

  useEffect(() => {
    if (!user || !serviceId) return;
    // Check existing uploads for this service
    supabase
      .from("document_uploads")
      .select("*")
      .eq("user_id", user.id)
      .eq("service_id", serviceId)
      .then(({ data }) => {
        const map: Record<string, { status: string; uploading: boolean }> = {};
        (data || []).forEach(d => {
          map[d.document_name] = { status: d.status, uploading: false };
        });
        setUploads(map);
      });
  }, [user, serviceId]);

  useEffect(() => {
    const allUploaded = requiredDocuments.every(doc => uploads[doc] && uploads[doc].status !== "rejected");
    onAllUploaded(allUploaded);
  }, [uploads, requiredDocuments, onAllUploaded]);

  const handleUpload = async (docName: string, file: File) => {
    if (!user) return;
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
      toast.success(`${docName} uploaded`);
      setUploads(prev => ({ ...prev, [docName]: { status: "pending", uploading: false } }));
    }
  };

  const statusIcon = (status: string) => {
    if (status === "verified") return <CheckCircle className="h-4 w-4 text-success" />;
    if (status === "rejected") return <XCircle className="h-4 w-4 text-destructive" />;
    if (status === "pending") return <FileUp className="h-4 w-4 text-warning" />;
    return null;
  };

  if (requiredDocuments.length === 0) return null;

  return (
    <Card className="shadow-elevated border-0">
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Upload className="h-5 w-5" /> Required Documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {requiredDocuments.map((docName) => {
          const upload = uploads[docName];
          return (
            <div key={docName} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <div className="flex-1">
                <p className="text-sm font-medium">{docName}</p>
                {upload && (
                  <div className="flex items-center gap-1 mt-1">
                    {statusIcon(upload.status)}
                    <Badge variant="outline" className="text-xs">{upload.status}</Badge>
                  </div>
                )}
              </div>
              {(!upload || upload.status === "rejected") && (
                <div className="relative">
                  <Input
                    type="file"
                    accept="image/*,.pdf,.doc,.docx"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(docName, file);
                    }}
                  />
                  <Button variant="outline" size="sm" className="gap-1" disabled={upload?.uploading}>
                    {upload?.uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                    Upload
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
