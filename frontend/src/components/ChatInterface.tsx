// src/components/ChatInterface.tsx
import React, { useState, useRef, useEffect } from 'react';
import { TextInput, Button, Group, Text, Card, Stack, ScrollArea, Loader, Avatar, useMantineTheme } from '@mantine/core';
import { Send, User, Bot, Youtube as YoutubeIcon } from 'lucide-react';

// Define the shape of a chat message
interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  // ADDED: Re-added timestampSeconds for the seek functionality
  timestampSeconds?: number;
}

// Define the props for our component
interface ChatInterfaceProps {
  // The full conversation history
  messages: ChatMessage[];
  // Function to call when a new message is sent.
  onSendMessage: (message: string, history: ChatMessage[]) => void;
  // Flag to show the "typing..." indicator
  isLoading: boolean;
  // ADDED: Re-added onSeekVideo to fix the error
  onSeekVideo: (seconds: number) => void;
}

// A new component for the "Sanchar is typing..." indicator
const TypingIndicator = () => (
    <Group justify="left" style={{ paddingLeft: '1rem', paddingBottom: '1rem' }}>
        <Card
            shadow="md"
            radius="lg"
            p="md"
            style={(theme) => ({
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

  // Automatically scroll to the latest message
  useEffect(() => {
    if (viewport.current) {
      viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim() && !isLoading) {
      onSendMessage(inputMessage, messages);
      setInputMessage('');
    }
  };
  
  // ADDED: Re-added the timestamp formatting function
  const formatTimestamp = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60); // Use Math.floor to avoid decimals
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };


  return (
    <Card
      shadow="xl"
      radius="lg"
      p={0}
      withBorder
      style={(theme) => ({
        height: 'calc(100vh - 160px)',
        minHeight: '400px',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.colors.dark[9],
        borderColor: theme.colors.dark[7],
        overflow: 'hidden',
      })}
    >
      {/* Custom Header */}
      <Group justify="space-between" p="md" style={(theme) => ({
          backgroundColor: theme.colors.dark[8],
          borderBottom: `1px solid ${theme.colors.dark[7]}`,
      })}>
          <Group>
              <Avatar color="indigo" radius="xl"><Bot size={20} /></Avatar>
              <Stack gap={0}>
                  <Text fw={700} size="md">Sanchar</Text>
                  <Text size="xs" c="green.4">
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: 'currentColor', marginRight: 4 }}></span>
                      Online
                  </Text>
              </Stack>
          </Group>
      </Group>

      {/* Chat messages display area */}
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
          {messages.map((msg) => (
            <Group
              key={msg.id}
              justify={msg.sender === 'user' ? 'flex-end' : 'flex-start'}
              style={{
                  animation: 'fadeIn 0.5s ease-in-out',
                  '@keyframes fadeIn': {
                      'from': { opacity: 0, transform: 'translateY(10px)' },
                      'to': { opacity: 1, transform: 'translateY(0)' },
                  },
              }}
            >
              <Card
                shadow="md"
                radius="lg"
                p="md"
                style={(theme) => ({
                  maxWidth: '80%',
                  color: theme.white,
                  background: msg.sender === 'user'
                    ? `linear-gradient(45deg, ${theme.colors.indigo[7]} 0%, ${theme.colors.blue[7]} 100%)`
                    : theme.colors.dark[6],
                })}
              >
                  <Group align="center" mb={5}>
                      {msg.sender === 'ai' ? <Bot size={16} /> : <User size={16} />}
                      <Text size="sm" fw={600}>
                          {msg.sender === 'user' ? 'You' : 'Sanchar'}
                      </Text>
                  </Group>
                <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
                  {msg.text}
                </Text>
                {/* ADDED: Re-added the timestamp button logic */}
                {msg.sender === 'ai' && msg.timestampSeconds !== undefined && (
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
          ))}
          {isLoading && <TypingIndicator />}
        </Stack>
      </ScrollArea>

      {/* Chat input form */}
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
              radius="xl"
              size="md"
              variant="filled"
              disabled={isLoading}
              style={(theme) => ({
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
