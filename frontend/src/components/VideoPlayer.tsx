// src/components/VideoPlayer.tsx
import React, {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
  type CSSProperties,
} from 'react';
import {
  Card,
  Group,
  Stack,
  Text,
  ActionIcon,
  Tooltip,
  useMantineTheme,
  Loader,
  Badge,
} from '@mantine/core';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, FastForward, Rewind,
  Type as CaptionsIcon, Film
} from 'lucide-react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type VideoPlayerHandle = {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  getPlayer: () => any | null;
};

type PlayerState = -1 | 0 | 1 | 2 | 3 | 5; // unstarted, ended, playing, paused, buffering, cued

interface VideoPlayerProps {
  videoId: string;
  startSeconds?: number;
  autoPlay?: boolean;
  controls?: 0 | 1; // 1 default
  modestBranding?: boolean; // default true
  rel?: 0 | 1; // default 0 (no related from other channels)
  annotations?: 1 | 3; // iv_load_policy: 1=show, 3=hide (default 3)
  showChrome?: boolean; // overlay controls — default true
  title?: string;
  className?: string;
  style?: CSSProperties;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

const ensureIframeApi = () =>
  new Promise<void>((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }
    const existing = document.getElementById('youtube-iframe-api');
    if (!existing) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.id = 'youtube-iframe-api';
      const firstScript = document.getElementsByTagName('script')[0];
      firstScript?.parentNode?.insertBefore(tag, firstScript);
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev && prev();
      resolve();
    };
  });

const formatHHMMSS = (secs: number) => {
  if (!Number.isFinite(secs) || secs < 0) secs = 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer(
  {
    videoId,
    startSeconds,
    autoPlay = false,
    controls = 1,
    modestBranding = true,
    rel = 0,
    annotations = 3,
    showChrome = true,
    title,
    className,
    style,
  },
  ref
) {
  const theme = useMantineTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [state, setState] = useState<PlayerState>(-1);
  const [isMuted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [theater, setTheater] = useState(false);
  const [loading, setLoading] = useState(true);

  // expose imperative API
  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      if (playerRef.current?.seekTo) {
        playerRef.current.seekTo(seconds, true);
        playerRef.current.playVideo?.();
      }
    },
    play: () => playerRef.current?.playVideo?.(),
    pause: () => playerRef.current?.pauseVideo?.(),
    getPlayer: () => playerRef.current ?? null,
  }));

  // Create/refresh player when videoId changes
  useEffect(() => {
    let timeTimer: any;

    const createPlayer = async () => {
      setLoading(true);
      setReady(false);

      await ensureIframeApi();

      // cleanup old player if re-mounting or changing videos
      if (playerRef.current && playerRef.current.destroy) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }

      if (!containerRef.current) return;

      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        events: {
          onReady: (event: any) => {
            setReady(true);
            setLoading(false);
            setMuted(!!event.target?.isMuted?.());
            setPlaybackRate(event.target?.getPlaybackRate?.() ?? 1);
            setDuration(event.target?.getDuration?.() ?? 0);

            // start time
            if (startSeconds && Number.isFinite(startSeconds) && startSeconds > 0) {
              event.target.seekTo(startSeconds, true);
            }
            if (autoPlay) {
              event.target.playVideo?.();
            }

            // track time
            timeTimer = setInterval(() => {
              try {
                const t = event.target?.getCurrentTime?.();
                const d = event.target?.getDuration?.();
                if (typeof t === 'number') setCurrent(t);
                if (typeof d === 'number') setDuration(d);
              } catch {}
            }, 300);
          },
          onStateChange: (e: any) => {
            setState(e.data as PlayerState);
          },
        },
        playerVars: {
          autoplay: autoPlay ? 1 : 0,
          controls,
          modestbranding: modestBranding ? 1 : 0,
          rel,
          iv_load_policy: annotations, // 3 = hide annotations
          enablejsapi: 1,
          origin: window.location.origin,
        },
      });
    };

    createPlayer();

    return () => {
      if (timeTimer) clearInterval(timeTimer);
      if (playerRef.current && playerRef.current.destroy) {
        try { playerRef.current.destroy(); } catch {}
      }
      playerRef.current = null;
    };
  }, [videoId, startSeconds, autoPlay, controls, modestBranding, rel, annotations]);

  // Overlay actions
  const togglePlay = () => {
    if (!playerRef.current) return;
    const s = playerRef.current.getPlayerState?.();
    if (s === 1) playerRef.current.pauseVideo?.();
    else playerRef.current.playVideo?.();
  };
  const seekRel = (delta: number) => {
    if (!playerRef.current) return;
    const t = playerRef.current.getCurrentTime?.() ?? 0;
    playerRef.current.seekTo(Math.max(0, t + delta), true);
  };
  const toggleMute = () => {
    if (!playerRef.current) return;
    const m = playerRef.current.isMuted?.();
    if (m) playerRef.current.unMute?.();
    else playerRef.current.mute?.();
    setMuted(!m);
  };
  const cycleSpeed = () => {
    if (!playerRef.current) return;
    const currentRate = playerRef.current.getPlaybackRate?.() ?? 1;
    const idx = SPEEDS.indexOf(currentRate);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    try {
      playerRef.current.setPlaybackRate?.(next);
      setPlaybackRate(next);
    } catch {}
  };
  const toggleTheater = () => setTheater((v) => !v);
  const toggleCaptions = () => {
    // Not officially documented for toggling programmatically; best-effort:
    // Many players ignore this unless the track exists.
    try {
      playerRef.current.setOption?.('captions', 'track', {});
    } catch {}
    // Visual hint only
  };
  const goFullscreen = () => {
    const iframeEl = (containerRef.current?.querySelector('iframe') ??
      iframeRef.current) as HTMLIFrameElement | null;
    if (!iframeEl) return;
    const anyEl: any = iframeEl;
    (anyEl.requestFullscreen || anyEl.webkitRequestFullscreen || anyEl.mozRequestFullScreen || anyEl.msRequestFullscreen)?.call(anyEl);
  };

  const playing = state === 1;

  return (
    <Card
      withBorder
      shadow="xl"
      radius="lg"
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: theme.colors.dark[8],
        borderColor: theme.colors.indigo[4],
        transition: 'border-color .2s ease',
        ...(style || {}),
      }}
    >
      {/* Aspect wrapper */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          paddingBottom: theater ? '42.85%' : '56.25%', // 21:9 vs 16:9
          transition: 'padding-bottom .2s ease',
        }}
      >
        {/* Player mount point */}
        <div
          ref={containerRef}
          style={{
            position: 'absolute',
            inset: 0,
          }}
        />
        {/* Loading overlay */}
        {loading && (
          <Stack
            align="center"
            justify="center"
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(2px)',
            }}
          >
            <Loader color="indigo" size="lg" />
            <Text c="gray.2">Initializing video player…</Text>
          </Stack>
        )}
      </div>

      {/* Top chrome: title + theater */}
      {showChrome && (
        <Group
          justify="space-between"
          px="md"
          py={8}
          style={{
            position: 'absolute',
            top: 0,
            insetInline: 0,
            background:
              'linear-gradient(180deg, rgba(0,0,0,.55), rgba(0,0,0,0))',
          }}
        >
          <Group gap="xs">
            <Film size={16} color="#A5B4FC" />
            <Text size="sm" c="gray.2" fw={600}>
              {title || 'YouTube Player'}
            </Text>
          </Group>

          <Group gap="xs">
            <Tooltip label={theater ? 'Exit theater' : 'Theater mode'}>
              <ActionIcon
                variant="subtle"
                onClick={toggleTheater}
                aria-label="Theater mode"
              >
                {theater ? <Minimize size={18} /> : <Maximize size={18} />}
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      )}

      {/* Bottom chrome: transport, time, volume, captions, speed, fullscreen */}
      {showChrome && (
        <Group
          justify="space-between"
          px="md"
          py={8}
          style={{
            position: 'absolute',
            bottom: 0,
            insetInline: 0,
            background:
              'linear-gradient(0deg, rgba(0,0,0,.6), rgba(0,0,0,0))',
          }}
        >
          <Group gap="xs" align="center">
            <Tooltip label={playing ? 'Pause' : 'Play'}>
              <ActionIcon
                variant="subtle"
                onClick={togglePlay}
                aria-label={playing ? 'Pause' : 'Play'}
              >
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Back 10s">
              <ActionIcon
                variant="subtle"
                onClick={() => seekRel(-10)}
                aria-label="Back 10 seconds"
              >
                <Rewind size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Forward 10s">
              <ActionIcon
                variant="subtle"
                onClick={() => seekRel(10)}
                aria-label="Forward 10 seconds"
              >
                <FastForward size={18} />
              </ActionIcon>
            </Tooltip>

            <Text size="xs" c="gray.3" fw={600}>
              {formatHHMMSS(current)} / {formatHHMMSS(duration)}
            </Text>
          </Group>

          <Group gap="xs" align="center">
            <Tooltip label={isMuted ? 'Unmute' : 'Mute'}>
              <ActionIcon
                variant="subtle"
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Captions (best-effort)">
              <ActionIcon
                variant="subtle"
                onClick={toggleCaptions}
                aria-label="Toggle captions"
              >
                <CaptionsIcon size={18} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label={`Speed ${playbackRate.toFixed(2)}x`}>
              <Badge
                variant="light"
                color="indigo"
                radius="sm"
                style={{ cursor: 'pointer' }}
                onClick={cycleSpeed}
              >
                {playbackRate.toFixed(2)}×
              </Badge>
            </Tooltip>

            <Tooltip label="Fullscreen">
              <ActionIcon
                variant="subtle"
                onClick={goFullscreen}
                aria-label="Fullscreen"
              >
                <Maximize size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      )}
    </Card>
  );
});

export default VideoPlayer;
