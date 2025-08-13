// src/components/ChatInterface.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  TextInput, Button, Group, Text, Card, Stack, ScrollArea, Loader, Avatar,
  useMantineTheme, Badge, Tooltip, ActionIcon
} from '@mantine/core';
import { Send, User, Bot, Youtube as YoutubeIcon, Clipboard } from 'lucide-react';

// Define the shape of a chat message
interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  // Keep: allows App to pass a single parsed timestamp for quick-seek
  timestampSeconds?: number;
}

// Define the props for our component
interface ChatInterfaceProps {
  // The full conversation history
  messages: ChatMessage[];
  // Function to call when a new message is sent (preserve your original signature!)
  onSendMessage: (message: string, history: ChatMessage[]) => void;
  // Typing indicator
  isLoading: boolean;
  // Seek callback
  onSeekVideo: (seconds: number) => void;
}

// Timestamp helpers (supports [HH:MM:SS] and [MM:SS])
const TS_ANY_GLOBAL = /\[(\d{2}):(\d{2})(?::(\d{2}))?\]/g;

function parseAllTimestamps(text: string): Array<{ raw: string; seconds: number }> {
  const out: Array<{ raw: string; seconds: number }> = [];
  const re = new RegExp(TS_ANY_GLOBAL); // new instance for safety
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const hasHH = typeof m[3] !== 'undefined';
    const hh = hasHH ? parseInt(m[1], 10) : 0;
    const mm = hasHH ? parseInt(m[2], 10) : parseInt(m[1], 10);
    const ss = hasHH ? parseInt(m[3] as string, 10) : parseInt(m[2] as string, 10);
    if (!Number.isNaN(mm) && !Number.isNaN(ss)) {
      out.push({ raw: m[0], seconds: hh * 3600 + mm * 60 + ss });
    }
  }
  return out;
}

function formatTimestampLabel(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// "Sanchar is typing..." indicator (kept)
const TypingIndicator = () => (
  <Group justify="left" style={{ paddingLeft: '1rem', paddingBottom: '1rem' }}>
    <Card
      shadow="md"
      radius="lg"
      p="md"
      style={(theme: any) => ({
        backgroundColor: theme.colors.dark[6],
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
      })}
    >
      <Loader size="sm" color="indigo" variant="dots" />
      <Text size="sm" c="dimmed">Sanchar is typing...</Text>
    </Card>
  </Group>
);

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isLoading, onSeekVideo }) => {
  const [inputMessage, setInputMessage] = useState<string>('');
  const viewport = useRef<HTMLDivElement>(null);
  const theme = useMantineTheme();

  // Auto-scroll to latest
  useEffect(() => {
    if (viewport.current) {
      viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (inputMessage.trim() && !isLoading) {
      onSendMessage(inputMessage, messages); // preserve your original API
      setInputMessage('');
    }
  };

  // Enter to send, Shift+Enter for newline
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Keep: your timestampSeconds rendering
  const formatTimestamp = (totalSeconds: number): string => formatTimestampLabel(totalSeconds);

  return (
    <Card
      shadow="xl"
      radius="lg"
      p={0}
      withBorder
      style={(theme: any) => ({
        height: 'calc(100vh - 160px)',
        minHeight: '400px',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.colors.dark[9],
        borderColor: theme.colors.dark[7],
        overflow: 'hidden',
      })}
    >
      {/* Header (kept) */}
      <Group justify="space-between" p="md" style={(theme: any) => ({
        backgroundColor: theme.colors.dark[8],
        borderBottom: `1px solid ${theme.colors.dark[7]}`,
      })}>
        <Group>
          <Avatar color="indigo" radius="xl"><Bot size={20} /></Avatar>
          <Stack gap={0}>
            <Text fw={700} size="md">Sanchar</Text>
            <Text size="xs" c="green.4">
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: 'currentColor', marginRight: 4 }} />
              Online
            </Text>
          </Stack>
        </Group>
      </Group>

      {/* Messages */}
      <ScrollArea
        viewportRef={viewport}
        style={{ flexGrow: 1 }}
        styles={{
          scrollbar: {
            '&, &:hover': { background: 'transparent' },
            '&[data-orientation="vertical"] .mantine-ScrollArea-thumb': {
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
            },
          },
        }}
      >
        <Stack justify="flex-end" p="md" gap="lg" style={{ minHeight: '100%' }}>
          {messages.map((msg) => {
            const isAI = msg.sender === 'ai';
            const tsHits = isAI ? parseAllTimestamps(msg.text) : [];
            const cleaned = isAI ? msg.text.replace(TS_ANY_GLOBAL, '').trim() : msg.text;

            return (
              <Group
                key={msg.id}
                justify={msg.sender === 'user' ? 'flex-end' : 'flex-start'}
                style={{
                  animation: 'fadeIn 0.5s ease-in-out',
                  '@keyframes fadeIn': {
                    from: { opacity: 0, transform: 'translateY(10px)' },
                    to: { opacity: 1, transform: 'translateY(0)' },
                  },
                }}
              >
                <Card
                  shadow="md"
                  radius="lg"
                  p="md"
                  style={(theme: any) => ({
                    maxWidth: '80%',
                    color: theme.white,
                    background: msg.sender === 'user'
                      ? `linear-gradient(45deg, ${theme.colors.indigo[7]} 0%, ${theme.colors.blue[7]} 100%)`
                      : theme.colors.dark[6],
                  })}
                >
                  <Group align="center" mb={5}>
                    {isAI ? <Bot size={16} /> : <User size={16} />}
                    <Text size="sm" fw={600}>{isAI ? 'Sanchar' : 'You'}</Text>
                    {/* Small copy button (optional, nice to have) */}
                    {isAI && (
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        aria-label="Copy message"
                        onClick={() => navigator.clipboard?.writeText(cleaned || msg.text)}
                        style={{ marginLeft: 'auto' }}
                      >
                        <Clipboard size={16} />
                      </ActionIcon>
                    )}
                  </Group>

                  {/* NEW: multi-timestamp badges for AI messages */}
                  {isAI && tsHits.length > 0 && (
                    <Group gap="xs" mb="xs" wrap="wrap">
                      {tsHits.map((t, idx) => (
                        <Tooltip key={`${msg.id}-ts-${idx}`} label={`Jump to ${formatTimestampLabel(t.seconds)}`}>
                          <Badge
                            variant="light"
                            color="indigo"
                            radius="sm"
                            leftSection={<YoutubeIcon size={12} />}
                            style={{ cursor: 'pointer' }}
                            onClick={() => onSeekVideo(t.seconds)}
                          >
                            {t.raw}
                          </Badge>
                        </Tooltip>
                      ))}
                    </Group>
                  )}

                  <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
                    {cleaned}
                  </Text>

                  {/* Kept: legacy single-button timestamp (when App already parsed one) */}
                  {isAI && msg.timestampSeconds !== undefined && (
                    <Button
                      variant="light"
                      color="indigo"
                      radius="xl"
                      size="xs"
                      onClick={() => onSeekVideo(msg.timestampSeconds!)}
                      leftSection={<YoutubeIcon size={14} />}
                      mt="xs"
                      ml="auto"
                    >
                      {formatTimestamp(msg.timestampSeconds)}
                    </Button>
                  )}
                </Card>
              </Group>
            );
          })}
          {isLoading && <TypingIndicator />}
        </Stack>
      </ScrollArea>

      {/* Input */}
      <div style={{
        padding: theme.spacing.md,
        borderTop: `1px solid ${theme.colors.dark[7]}`,
        backgroundColor: theme.colors.dark[8],
      }}>
        <form onSubmit={handleSubmit}>
          <Group grow align="center" gap="sm">
            <TextInput
              placeholder="Ask Sanchar about the video..."
              value={inputMessage}
              onChange={(event) => setInputMessage(event.currentTarget.value)}
              onKeyDown={handleKeyDown}
              radius="xl"
              size="md"
              variant="filled"
              disabled={isLoading}
              style={(theme: any) => ({
                flexGrow: 1,
                '& .mantine-TextInput-input': {
                  backgroundColor: theme.colors.dark[7],
                  border: `1px solid ${theme.colors.dark[5]}`,
                  color: theme.white,
                  transition: 'border-color 0.2s ease',
                  '&:focus, &:focus-within': {
                    borderColor: theme.colors.indigo[6],
                  },
                  '&::placeholder': {
                    color: theme.colors.dark[2],
                  },
                },
              })}
            />
            <Button
              type="submit"
              disabled={isLoading || !inputMessage.trim()}
              size="md"
              radius="xl"
              color="indigo"
              variant="gradient"
              gradient={{ from: 'indigo', to: 'cyan' }}
            >
              <Send size={20} />
            </Button>
          </Group>
        </form>
      </div>
    </Card>
  );
};

export default ChatInterface;
