import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, CheckCircle, AlertTriangle, FileText, Film, Image } from "lucide-react";

const CAP_MB = { image: 5, video: 16, document: 100 };
const ACCEPT = {
  image: "image/jpeg,image/png",
  video: "video/mp4,video/3gpp",
  document: "application/pdf",
};

export function MediaHeaderUpload({
  headerType,
  currentHandle,
  currentSendMediaUrl,
  currentFilename,
  onUploaded,
}) {
  const { user, api } = useAuth();
  const hasMetaCreds = user?.meta_waba_id && user?.meta_access_token;
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(currentSendMediaUrl || null);
  const [fname, setFname] = useState(currentFilename || null);

  const maxMb = CAP_MB[headerType] || 5;

  if (!hasMetaCreds) {
    return (
      <div
        className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex items-center gap-2"
        data-testid="meta-creds-missing-banner"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Configure Meta API first (Settings &gt; WhatsApp &gt; Meta API) before uploading header media.
      </div>
    );
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`File too large. Max ${maxMb} MB for ${headerType}.`);
      return;
    }
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setFname(file.name);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("template_slug", "header");
    try {
      const resp = await api.post("/whatsapp/upload-media-header", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onUploaded(resp.data);
      setPreviewUrl(resp.data.send_media_url);
      setFname(resp.data.filename);
      toast.success("Header uploaded — Meta handle + delivery URL ready.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
      setPreviewUrl(currentSendMediaUrl || null);
      setFname(currentFilename || null);
    } finally {
      setUploading(false);
    }
  };

  const IconComp = headerType === "image" ? Image : headerType === "video" ? Film : FileText;

  return (
    <div className="space-y-3" data-testid="media-header-upload">
      <div className="flex items-center gap-3">
        <label
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed cursor-pointer transition-colors
            ${uploading ? "opacity-50 pointer-events-none border-gray-300 bg-gray-50" : "border-[var(--brand-orange)] hover:bg-orange-50"}`}
        >
          <Upload className="h-4 w-4" />
          <span className="text-sm font-medium">{uploading ? "Uploading..." : "Choose file"}</span>
          <input
            type="file"
            accept={ACCEPT[headerType] || "*/*"}
            onChange={handleFile}
            disabled={uploading}
            className="hidden"
            data-testid="header-media-file-input"
          />
        </label>
        <span className="text-xs text-muted-foreground">Max {maxMb} MB ({headerType})</span>
      </div>

      {previewUrl && headerType === "image" && (
        <img src={previewUrl} alt="preview" className="max-h-40 rounded border" data-testid="header-media-preview" />
      )}
      {previewUrl && headerType !== "image" && fname && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="header-media-filename">
          <IconComp className="h-4 w-4" /> {fname}
        </div>
      )}
      {currentHandle && (
        <div className="flex items-center gap-1 text-xs text-emerald-600" data-testid="header-handle-ok">
          <CheckCircle className="h-3 w-3" /> Meta handle ready
        </div>
      )}
    </div>
  );
}
