// src/components/ChatInterface.tstyle
import React, { useState, useRef, useEffect } from 'react';
import { TextInput, Button, Group, Text, Card, Stack, ScrollArea, Loader } from '@mantine/core';
import { Send, User, Bot, Youtube as YoutubeIcon } from 'lucide-react'; // Renamed Youtube to YoutubeIcon to avoid conflict

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestampSeconds?: number;
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  onSeekVideo: (seconds: number) => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isLoading, onSeekVideo }) => {
  const [inputMessage, setInputMessage] = useState<string>('');
  const viewport = useRef<HTMLDivElement>(null); // Ref for ScrollArea's viewport

  useEffect(() => {
    // Scroll to bottom when messages change
    if (viewport.current) {
      viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim() && !isLoading) {
      onSendMessage(inputMessage);
      setInputMessage('');
    }
  };

  const formatTimestamp = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <Card shadow="xl" radius="md" p="md" withBorder
      style={(theme) => ({
        flexGrow: 1, display: 'flex', flexDirection: 'column',
        backgroundColor: theme.colors.dark[8],
        borderColor: theme.colors.indigo[7],
      })}
    >
      {/* Chat messages display area */}
      <ScrollArea
        viewportRef={viewport}
        style={{ flexGrow: 1, paddingRight: '1rem' }} // Add some padding for scrollbar
        className="custom-scrollbar" // Apply custom scrollbar from index.css
      >
        <Stack justify="md" py="xs">
          {messages.map((msg) => (
            <Group
              key={msg.id}
              justify={msg.sender === 'user' ? 'right' : 'left'}
              style={{ alignItems: 'flex-end' }}
            >
              <Card
                shadow="sm"
                radius={msg.sender === 'user' ? "xl" : "xl"} // More rounded for all corners
                p="md"
                style={(theme) => ({
                  maxWidth: '85%',
                  backgroundColor: msg.sender === 'user' ? theme.colors.indigo[6] : theme.colors.dark[7],
                  color: theme.white,
                  borderBottomRightRadius: msg.sender === 'user' ? '4px' : '20px', // Pointed corner for user
                  borderBottomLeftRadius: msg.sender === 'user' ? '20px' : '4px', // Pointed corner for AI
                  display: 'flex',
                  flexDirection: 'column',
                })}
              >
                <Group justify="xs" style={{ marginBottom: '0.25rem', alignItems: 'center' }}>
                  {msg.sender === 'ai' && <Bot size={20} color={msg.sender === 'ai' ? '#818CF8' : undefined} />}
                  <Text size="sm" style= {{fontWeight: 600}} color={msg.sender === 'user' ? 'indigo.1' : 'indigo.3'}>
                    {msg.sender === 'user' ? 'You' : 'AI Assistant'}
                  </Text>
                </Group>
                <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.text}</Text>
                {msg.sender === 'ai' && msg.timestampSeconds !== undefined && (
                  <Button
                    
                    variant="filled"
                    color="indigo"
                    radius="xl"
                    size="xs"
                    onClick={() => onSeekVideo(msg.timestampSeconds!)}
                    leftSection={<YoutubeIcon size={14} />}
                    mt="xs"
                    ml="auto" // Push button to the right within the bubble
                    style={(theme) => ({
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        transform: 'scale(1.05)',
                        backgroundColor: theme.colors.indigo[5],
                      },
                      '&:active': {
                        transform: 'scale(0.95)',
                      },
                    })}
                  >
                    {formatTimestamp(msg.timestampSeconds)}
                  </Button>
                )}
              </Card>
            </Group>
          ))}
          {isLoading && messages.length > 0 && (
            <Group justify="left" style={{ alignItems: 'flex-end' }}>
              <Card shadow="sm" radius="md" p="md" style={(theme) => ({
                maxWidth: '80%',
                backgroundColor: theme.colors.dark[7],
                color: theme.colors.gray[0],
                animation: 'pulse 2s infinite',
                '@keyframes pulse': {
                  '0%': { opacity: 1 },
                  '50%': { opacity: 0.7 },
                  '100%': { opacity: 1 },
                }
              })}>
                <Group justify="xs" style={{ alignItems: 'center' }}>
                  <Loader size="sm" color="indigo" style={{ animation: 'spin 1s linear infinite' }} />
                  <Text size="sm">AI is thinking...</Text>
                </Group>
              </Card>
            </Group>
          )}
        </Stack>
      </ScrollArea>

      {/* Chat input form */}
      <form onSubmit={handleSubmit}>
        <Group grow justify="xs" pt="sm" style={(theme) => ({ borderTop: `1px solid ${theme.colors.gray[7]}` })}>
          <TextInput
            placeholder="Ask about the video..."
            value={inputMessage}
            onChange={(event) => setInputMessage(event.currentTarget.value)}
            radius="md"
            size="md"
            variant="filled"
            disabled={isLoading}
            style={(theme) => ({
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
            })}
          />
          <Button
            type="submit"
            disabled={isLoading || !inputMessage.trim()}
            size="md"
            radius="md"
            variant="filled"
            color="indigo"
            style={(theme) => ({
              minWidth: '60px',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'scale(1.05)',
              },
              '&:active': {
                transform: 'scale(0.95)',
              },
              '&[data-disabled]': {
                backgroundColor: theme.colors.indigo[5],
                opacity: 0.5,
                cursor: 'not-allowed',
                transform: 'none',
                boxShadow: 'none',
              },
            })}
          >
            <Send size={20} />
          </Button>
        </Group>
      </form>
    </Card>
  );
};

export default ChatInterface;
