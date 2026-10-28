import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadTask,
} from "firebase/storage";
import { storage } from "@/lib/firebase";

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm"];

export interface MediaUploadResult {
  downloadUrl: string;
  storagePath: string;
  mediaType: "image" | "video";
  width?: number;
  height?: number;
  aspectRatio?: string;
  sizeBytes: number;
}

export function validateMediaFile(file: File): { valid: boolean; error?: string } {
  const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type);
  const isVideo = ACCEPTED_VIDEO_TYPES.includes(file.type);

  if (!isImage && !isVideo) {
    return {
      valid: false,
      error: "Unsupported file format. Please upload JPG, PNG, WEBP, GIF, MP4, or WEBM.",
    };
  }

  if (isImage && file.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Image exceeds maximum allowed size of 10MB (${(file.size / (1024 * 1024)).toFixed(1)}MB).`,
    };
  }

  if (isVideo && file.size > MAX_VIDEO_SIZE_BYTES) {
    return {
      valid: false,
      error: `Video exceeds maximum allowed size of 50MB (${(file.size / (1024 * 1024)).toFixed(1)}MB).`,
    };
  }

  return { valid: true };
}

// Compute aspect ratio string like "16:9", "1:1", "3:1", etc.
export function formatAspectRatio(width: number, height: number): string {
  if (!width || !height) return "16:9";

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  const wRatio = Math.round(width / divisor);
  const hRatio = Math.round(height / divisor);

  // Common known ratios approximations
  const ratio = width / height;
  if (Math.abs(ratio - 16 / 9) < 0.05) return "16:9";
  if (Math.abs(ratio - 1) < 0.05) return "1:1";
  if (Math.abs(ratio - 3) < 0.1) return "3:1";
  if (Math.abs(ratio - 4 / 3) < 0.05) return "4:3";
  if (Math.abs(ratio - 9 / 16) < 0.05) return "9:16";

  return `${wRatio}:${hRatio}`;
}

export async function detectMediaDimensions(
  file: File,
): Promise<{ width?: number; height?: number; aspectRatio?: string }> {
  return new Promise((resolve) => {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    const objectUrl = URL.createObjectURL(file);

    if (isImage) {
      const img = new Image();
      img.onload = () => {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        URL.revokeObjectURL(objectUrl);
        resolve({
          width,
          height,
          aspectRatio: formatAspectRatio(width, height),
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({});
      };
      img.src = objectUrl;
    } else if (isVideo) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const width = video.videoWidth;
        const height = video.videoHeight;
        URL.revokeObjectURL(objectUrl);
        resolve({
          width,
          height,
          aspectRatio: formatAspectRatio(width, height),
        });
      };
      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({});
      };
      video.src = objectUrl;
    } else {
      URL.revokeObjectURL(objectUrl);
      resolve({});
    }
  });
}

export function startMediaUpload(
  file: File,
  onProgress?: (percent: number) => void,
): {
  task: UploadTask;
  promise: Promise<MediaUploadResult>;
} {
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const uniqueId = Math.random().toString(36).substring(2, 9);
  const storagePath = `ads/${Date.now()}_${uniqueId}_${sanitizedName}`;
  const storageRef = ref(storage, storagePath);

  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type,
  });

  const promise = new Promise<MediaUploadResult>((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) {
          onProgress(Math.round(progress));
        }
      },
      (error) => {
        reject(error);
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(task.snapshot.ref);
          const dimensions = await detectMediaDimensions(file);
          const isVideo = file.type.startsWith("video/");

          resolve({
            downloadUrl,
            storagePath,
            mediaType: isVideo ? "video" : "image",
            width: dimensions.width,
            height: dimensions.height,
            aspectRatio: dimensions.aspectRatio,
            sizeBytes: file.size,
          });
        } catch (err) {
          reject(err);
        }
      },
    );
  });

  return { task, promise };
}

export async function deleteUploadedMedia(storagePath: string): Promise<boolean> {
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
    return true;
  } catch (err) {
    console.warn("[Firebase Storage] Delete failed:", err);
    return false;
  }
}
