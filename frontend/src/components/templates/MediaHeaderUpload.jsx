import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Upload, CheckCircle, AlertTriangle, FileText, Film, Image } from "lucide-react";

const CAP_MB = { image: 5, video: 16, document: 100 };
const CHUNK_SIZE = 4 * 1024 * 1024; // CR-036 B.3 (Q21=a): 4 MB chunks
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
  const [progress, setProgress] = useState(null); // CR-036 B.3 (E-B3-6): {pct, phase: "upload"|"finalize"}
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

    try {
      let data;
      if (file.size > CHUNK_SIZE) {
        // CR-036 B.3 (E-B3-8): chunked path for files > 4 MB
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const initRes = await api.post("/whatsapp/upload-media-header/init", {
          filename: file.name,
          mime: file.type,
          total_size: file.size,
          total_chunks: totalChunks,
          template_slug: "header",
        });
        const uploadId = initRes.data.upload_id;
        for (let i = 0; i < totalChunks; i++) {
          const fd = new FormData();
          fd.append("chunk_index", i);
          fd.append("file", file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
          await api.post(`/whatsapp/upload-media-header/chunk/${uploadId}`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          setProgress({ pct: Math.round(((i + 1) / totalChunks) * 100), phase: "upload" });
        }
        setProgress({ pct: 100, phase: "finalize" });
        const resp = await api.post(`/whatsapp/upload-media-header/complete/${uploadId}`);
        data = resp.data;
      } else {
        // CR-036 B.3 (E-B3-7): single-shot path with upload progress
        const formData = new FormData();
        formData.append("file", file);
        formData.append("template_slug", "header");
        const resp = await api.post("/whatsapp/upload-media-header", formData, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (ev) => {
            if (!ev.total) return;
            const pct = Math.round((ev.loaded / ev.total) * 100);
            setProgress({ pct, phase: ev.loaded === ev.total ? "finalize" : "upload" });
          },
        });
        data = resp.data;
      }
      onUploaded(data);
      setPreviewUrl(data.send_media_url);
      setFname(data.filename);
      toast.success("Header uploaded — Meta handle + delivery URL ready.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
      setPreviewUrl(currentSendMediaUrl || null);
      setFname(currentFilename || null);
    } finally {
      setUploading(false);
      setProgress(null);
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

      {/* CR-036 B.3 (E-B3-9): upload progress */}
      {progress && (
        <div className="space-y-1" data-testid="media-upload-progress">
          <Progress value={progress.pct} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {progress.phase === "finalize" ? "Finalizing — sending to Meta & S3…" : `Uploading… ${progress.pct}%`}
          </p>
        </div>
      )}

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
