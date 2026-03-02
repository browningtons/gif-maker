import { useEffect, useState } from 'react';
import { type VideoMeta, MIN_TRIM_DURATION } from '../types';

export type VideoMetaResult = VideoMeta & {
  thumbnailUrl: string | null;
};

export function useVideoMeta(
  file: File | null,
  onMetaLoaded: (duration: number) => void
): VideoMetaResult {
  const [meta, setMeta] = useState<VideoMeta>({ duration: 0, width: 0, height: 0 });
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setMeta({ duration: 0, width: 0, height: 0 });
      setThumbnailUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const probe = document.createElement('video');
    probe.preload = 'auto';
    probe.muted = true;
    probe.src = objectUrl;

    let thumbRevoked = false;

    const captureThumbnail = () => {
      try {
        const canvas = document.createElement('canvas');
        // Use a reasonable thumbnail size (max 320px wide)
        const scale = Math.min(1, 320 / (probe.videoWidth || 320));
        canvas.width = Math.round((probe.videoWidth || 320) * scale);
        canvas.height = Math.round((probe.videoHeight || 180) * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(probe, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (blob && !thumbRevoked) {
              setThumbnailUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return URL.createObjectURL(blob);
              });
            }
          }, 'image/jpeg', 0.8);
        }
      } catch {
        // Cross-origin or tainted canvas — thumbnail not available
      }
    };

    const onLoadedMetadata = () => {
      const duration =
        Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 0;
      const sourceWidth = probe.videoWidth || 0;
      const sourceHeight = probe.videoHeight || 0;
      setMeta({ duration, width: sourceWidth, height: sourceHeight });
      onMetaLoaded(duration > 0 ? Math.min(5, Math.max(MIN_TRIM_DURATION, duration)) : 5);

      // Seek to 0.5s (or 0 for very short clips) to get a representative frame
      const seekTarget = duration > 1 ? 0.5 : 0;
      probe.currentTime = seekTarget;
    };

    const onSeeked = () => {
      captureThumbnail();
    };

    probe.addEventListener('loadedmetadata', onLoadedMetadata);
    probe.addEventListener('seeked', onSeeked);
    probe.load();

    return () => {
      thumbRevoked = true;
      probe.removeEventListener('loadedmetadata', onLoadedMetadata);
      probe.removeEventListener('seeked', onSeeked);
      probe.pause();
      URL.revokeObjectURL(objectUrl);
    };
    // onMetaLoaded is a callback from parent — we intentionally omit it from deps
    // to avoid re-probing the video when the callback identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  return { ...meta, thumbnailUrl };
}
