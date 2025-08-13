// src/components/VideoInput.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  TextInput, Button, Group, Loader, Card, Text, Stack,
  useMantineTheme, Badge, Alert, ActionIcon, Tooltip, Divider
} from '@mantine/core';
import { Youtube, XCircle, Sparkles } from 'lucide-react';

interface VideoInputProps {
  onLoadVideo: (url: string) => void;
  isLoading: boolean;
}

// === ADDED: localStorage key for recents
const RECENTS_KEY = 'talk2yt_recent_urls';

// === ADDED: helpers to extract/normalize YouTube URLs
function parseYouTubeId(raw: string): { id?: string; start?: number } {
  try {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    // Support bare IDs:
    const bareIdMatch = trimmed.match(/^[a-zA-Z0-9_-]{11}$/);
    if (bareIdMatch) return { id: trimmed };

    // Try URL parsing
    let url = trimmed;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const u = new URL(url);

    // Common hosts
    const host = u.hostname.replace(/^www\./, '');
    let id: string | undefined;

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      // /watch?v=ID
      if (u.pathname === '/watch') id = u.searchParams.get('v') ?? undefined;
      // /embed/ID
      if (!id && u.pathname.startsWith('/embed/')) id = u.pathname.split('/embed/')[1]?.split('/')[0];
      // /v/ID
      if (!id && u.pathname.startsWith('/v/')) id = u.pathname.split('/v/')[1]?.split('/')[0];
      // /shorts/ID
      if (!id && u.pathname.startsWith('/shorts/')) id = u.pathname.split('/shorts/')[1]?.split('/')[0];
    } else if (host === 'youtu.be') {
      id = u.pathname.slice(1).split('/')[0];
    }

    // Parse start time (?t=?, ?start=?, or hash #t=1m30s)
    let start: number | undefined;
    const t = u.searchParams.get('t') || u.searchParams.get('start');
    if (t) {
      // t can be seconds or 1h2m3s
      start = tsToSeconds(t);
    } else if (u.hash && u.hash.includes('t=')) {
      const hashT = u.hash.split('t=')[1];
      if (hashT) start = tsToSeconds(hashT);
    }

    // Validate found id
    if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
      return { id, start };
    }
  } catch {
    // ignore
  }
  return {};
}

function tsToSeconds(v: string): number {
  // supports 90, 1m30s, 2h3m4s
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  const h = /(\d+)h/i.exec(v)?.[1];
  const m = /(\d+)m/i.exec(v)?.[1];
  const s = /(\d+)s/i.exec(v)?.[1];
  return (h ? parseInt(h, 10) * 3600 : 0) + (m ? parseInt(m, 10) * 60 : 0) + (s ? parseInt(s, 10) : 0);
}

function canonicalWatchUrl(id: string, start?: number): string {
  const base = `https://www.youtube.com/watch?v=${id}`;
  if (start && Number.isFinite(start) && start > 0) {
    return `${base}&t=${start}s`;
  }
  return base;
}

const VideoInput: React.FC<VideoInputProps> = ({ onLoadVideo, isLoading }) => {
  const [url, setUrl] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [recents, setRecents] = useState<string[]>([]);
  const theme = useMantineTheme();

  // === ADDED: sample links (feel free to tweak)
  const sampleLinks = useMemo(
    () => [
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=5qap5aO4i9A',
      'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    ],
    []
  );

  // === ADDED: load recents
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) setRecents(list.slice(0, 8));
      }
    } catch {
      // ignore
    }
  }, []);

  // === ADDED: validate on change
  useEffect(() => {
    if (!url.trim()) {
      setError('');
      return;
    }
    const { id } = parseYouTubeId(url);
    if (!id) setError('Please enter a valid YouTube link or 11-char video ID.');
    else setError('');
  }, [url]);

  // === ADDED: persist recents
  const pushRecent = (normalized: string) => {
    try {
      const next = [normalized, ...recents.filter((r) => r !== normalized)].slice(0, 8);
      setRecents(next);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { id, start } = parseYouTubeId(url);
    if (!id) {
      setError('Please enter a valid YouTube link or 11-char video ID.');
      return;
    }
    const normalized = canonicalWatchUrl(id, start);
    pushRecent(normalized);
    onLoadVideo(normalized);
  };

  // === ADDED: auto-submit right after paste if it looks valid
  const handlePaste: React.ClipboardEventHandler<HTMLInputElement> = (e) => {
    const pasted = e.clipboardData.getData('text');
    setTimeout(() => {
      const { id } = parseYouTubeId(pasted);
      if (id) {
        setUrl(pasted.trim());
        // small delay to let state update, then auto-submit if not loading
        setTimeout(() => {
          if (!isLoading) {
            const { id: pid, start } = parseYouTubeId(pasted);
            if (pid) {
              const normalized = canonicalWatchUrl(pid, start);
              pushRecent(normalized);
              onLoadVideo(normalized);
            }
          }
        }, 120);
      }
    }, 0);
  };

  // === ADDED: quick-fill helpers
  const useSample = (link: string) => {
    setUrl(link);
    setError('');
  };
  const useRecent = (link: string) => {
    setUrl(link);
    setError('');
  };

  // === ADDED: clear input
  const clearUrl = () => {
    setUrl('');
    setError('');
  };

  const isValid = !error && !!parseYouTubeId(url).id;

  return (
    <Card
      padding="xl"
      radius="lg"
      shadow="xl"
      withBorder
      style={{
        backgroundColor: theme.colors.dark[8],
        borderColor: theme.colors.gray[7],
        maxWidth: '700px',
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      <Stack gap="lg">
        <Group align="center" justify="center" gap="xs">
          <Youtube size={22} color="#EF4444" />
          <Text
            size="xl"
            fw={800}
            c={theme.colors.gray[0]}
            ta="center"
            style={{
              marginBottom: theme.spacing.xs,
              letterSpacing: '-0.02em',
            }}
          >
            Unlock Insights from YouTube Videos
          </Text>
          <Sparkles size={18} color={theme.colors.yellow[5]} />
        </Group>

        {/* === ADDED: samples row */}
        <Group gap="xs" justify="center" wrap="wrap">
          {sampleLinks.map((s) => (
            <Badge
              key={s}
              variant="light"
              color="indigo"
              radius="sm"
              style={{ cursor: 'pointer' }}
              onClick={() => useSample(s)}
              title="Use sample video"
            >
              Sample
            </Badge>
          ))}
          {recents.length > 0 && <Divider orientation="vertical" />}
          {recents.map((r) => (
            <Badge
              key={r}
              variant="outline"
              color="gray"
              radius="sm"
              style={{ cursor: 'pointer' }}
              onClick={() => useRecent(r)}
              title={r}
            >
              Recent
            </Badge>
          ))}
        </Group>

        {/* Input + Analyze */}
        <form onSubmit={handleSubmit}>
          <Group
            grow
            align="center"
            gap="md"
            style={{
              flexDirection: 'column',
              [`@media (min-width: ${theme.breakpoints.sm})`]: {
                flexDirection: 'row',
              },
            }}
          >
            <TextInput
              placeholder="Enter YouTube link or 11-char ID (e.g., https://youtu.be/dQw4w9WgXcQ)"
              value={url}
              onChange={(event) => setUrl(event.currentTarget.value)}
              onPaste={handlePaste} // === ADDED
              leftSection={<Youtube size={20} color="#EF4444" />}
              rightSection={url ? (
                <Tooltip label="Clear">
                  <ActionIcon variant="subtle" onClick={clearUrl} aria-label="Clear">
                    <XCircle size={16} />
                  </ActionIcon>
                </Tooltip>
              ) : undefined}
              radius="md"
              size="md"
              variant="filled"
              disabled={isLoading}
              style={{
                flexGrow: 1,
                '& .mantine-TextInput-input': {
                  backgroundColor: theme.colors.dark[7],
                  borderColor: theme.colors.gray[6],
                  color: theme.colors.gray[0],
                  '&::placeholder': {
                    color: theme.colors.gray[5],
                  },
                  '&:focus': {
                    borderColor: theme.colors.indigo[5],
                    boxShadow: `0 0 0 2px ${theme.colors.indigo[5]}`,
                  },
                },
              }}
              error={error || undefined} // === ADDED
            />

            <Button
              type="submit"
              disabled={isLoading || !isValid}
              size="md"
              radius="md"
              variant="gradient"
              gradient={{ from: 'indigo', to: 'blue', deg: 45 }}
              leftSection={isLoading ? <Loader size={20} color="white" /> : null}
              style={{
                minWidth: '150px',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: theme.shadows.lg,
                },
                '&:active': {
                  transform: 'translateY(0)',
                },
                '&[data-disabled]': {
                  background: `linear-gradient(45deg, ${theme.colors.indigo[5]} 0%, ${theme.colors.blue[5]} 100%)`,
                  opacity: 0.6,
                  cursor: 'not-allowed',
                  transform: 'none',
                  boxShadow: 'none',
                },
              }}
            >
              {isLoading ? 'Processing…' : 'Analyze Video'}
            </Button>
          </Group>
        </form>

        {/* === ADDED: gentle hint */}
        <Alert
          variant="light"
          color="indigo"
          radius="md"
          styles={{
            message: { color: theme.colors.gray[4] },
          }}
        >
          Paste a YouTube link to auto-analyze. Start times like <Text span fw={700}>?t=90</Text> or <Text span fw={700}>#t=1m30s</Text> are supported.
        </Alert>
      </Stack>
    </Card>
  );
};

export default VideoInput;
