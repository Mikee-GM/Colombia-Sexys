"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { uploadUberScreenshot } from "@/lib/actions/jefe-panel";

export default function UberScreenshotUploader({
  tripId,
  onRefresh,
}: {
  tripId: string;
  onRefresh: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("tripId", tripId);
      formData.append("file", file);
      const result = await uploadUberScreenshot(formData);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Captura enviada");
      await onRefresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 p-3 text-xs text-zinc-500">
      <p>Sube la captura del resumen del viaje</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
        className="mt-3 block w-full cursor-pointer text-xs text-zinc-400 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-[#C5A55A] file:bg-transparent file:px-3 file:py-2 file:text-xs file:font-semibold file:text-[#C5A55A] disabled:opacity-50"
      />
      {uploading && <p className="mt-2 text-[#C5A55A]">Subiendo...</p>}
    </div>
  );
}
