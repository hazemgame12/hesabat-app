import { useState, useRef } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getAdminToken } from "@/lib/api";

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}

export default function ImageUpload({ value, onChange, label = "صورة" }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const token = getAdminToken();
    if (!token) return;
    setError("");
    if (file.size > 5 * 1024 * 1024) {
      setError("الصورة كبيرة جداً (الحد الأقصى 5MB)");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/uploads", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      onChange(data.url);
    } catch {
      setError("فشل رفع الصورة، حاول مرة أخرى");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-gray-700">{label}</label>

      {value && (
        <div className="relative inline-block">
          <img
            src={value}
            alt=""
            className="w-full max-w-md h-40 object-cover rounded-xl border border-gray-200"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-2 left-2 bg-white/95 hover:bg-red-50 text-red-600 rounded-full p-1.5 shadow-md transition-colors"
            aria-label="حذف الصورة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 hover:border-primary hover:bg-primary/5 rounded-xl text-sm font-semibold text-gray-600 transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              جاري الرفع...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              {value ? "تغيير الصورة" : "رفع صورة من جهازك"}
            </>
          )}
        </button>
        <Input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-400">
        <div className="flex-1 h-px bg-gray-200" />
        <span>أو</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ألصق رابط صورة (URL)"
        dir="ltr"
        className="h-11"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
