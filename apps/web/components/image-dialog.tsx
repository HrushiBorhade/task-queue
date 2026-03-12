"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DownloadSimple, ShareNetwork, Check } from "@phosphor-icons/react";
import { spring } from "@/lib/animations";
import { track } from "@/lib/analytics";

interface ImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  prompt: string;
  taskId?: string;
}

export function ImageDialog({
  open,
  onOpenChange,
  imageUrl,
  prompt,
  taskId,
}: ImageDialogProps) {
  const [copied, setCopied] = useState(false);

  async function handleDownload() {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const ext = blob.type.includes("png") ? "png" : "jpg";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `generated-${Date.now()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      if (taskId) track("image_downloaded", { taskId });
    } catch {
      // Fallback: open in new tab so user can right-click save
      window.open(imageUrl, "_blank");
    }
  }

  async function handleShare() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Generated Image",
          text: prompt,
          url: imageUrl,
        });
        if (taskId) track("image_shared", { taskId, method: "native" });
      } else {
        await navigator.clipboard.writeText(imageUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        if (taskId) track("image_shared", { taskId, method: "clipboard" });
      }
    } catch {
      // clipboard.writeText can throw if page isn't focused — ignore
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => {
        if (o && taskId) track("image_dialog_opened", { taskId });
        onOpenChange(o);
      }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">Generated Image</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <motion.div
            className="relative overflow-hidden rounded-lg"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={spring}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={prompt}
              className="w-full rounded-lg"
            />
          </motion.div>

          <p className="text-xs text-muted-foreground">{prompt}</p>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <DownloadSimple data-icon="inline-start" />
              Download
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare}>
              {copied ? (
                <Check data-icon="inline-start" />
              ) : (
                <ShareNetwork data-icon="inline-start" />
              )}
              {copied ? "Copied!" : "Share"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
