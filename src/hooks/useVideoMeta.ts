import { useEffect, useState } from 'react';
import { type VideoMeta, MIN_TRIM_DURATION } from '../types';

export function useVideoMeta(
  file: File | null,
  onMetaLoaded: (duration: number) => void
): VideoMeta {
  const [meta, setMeta] = useState<VideoMeta>({ duration: 0, width: 0, height: 0 });

  useEffect(() => {
    if (!file) {
      setMeta({ duration: 0, width: 0, height: 0 });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.src = objectUrl;

    const onLoadedMetadata = () => {
      const duration =
        Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 0;
      const sourceWidth = probe.videoWidth || 0;
      const sourceHeight = probe.videoHeight || 0;
      setMeta({ duration, width: sourceWidth, height: sourceHeight });
      onMetaLoaded(duration > 0 ? Math.min(5, Math.max(MIN_TRIM_DURATION, duration)) : 5);
    };

    probe.addEventListener('loadedmetadata', onLoadedMetadata);
    probe.load();

    return () => {
      probe.removeEventListener('loadedmetadata', onLoadedMetadata);
      URL.revokeObjectURL(objectUrl);
    };
    // onMetaLoaded is a callback from parent — we intentionally omit it from deps
    // to avoid re-probing the video when the callback identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  return meta;
}
