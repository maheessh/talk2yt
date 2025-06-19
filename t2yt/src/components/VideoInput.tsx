// src/components/VideoInput.tsx
import React, { useState } from 'react';
import { TextInput, Button, Group, Loader } from '@mantine/core';
import { Youtube, Loader2 } from 'lucide-react';

interface VideoInputProps {
  onLoadVideo: (url: string) => void;
  isLoading: boolean;
}

const VideoInput: React.FC<VideoInputProps> = ({ onLoadVideo, isLoading }) => {
  const [url, setUrl] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onLoadVideo(url);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Group grow align="center" style={(theme) => ({
        backgroundColor: theme.colors.dark[8],
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        boxShadow: theme.shadows.xl,
        border: `1px solid ${theme.colors.gray[7]}`,
        // Responsive flex direction change
        flexDirection: 'column',
        [`@media (min-width: ${theme.breakpoints.sm})`]: {
          flexDirection: 'row',
        },
      })}>
        <TextInput
          placeholder="Enter YouTube video URL (e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ)"
          value={url}
          onChange={(event) => setUrl(event.currentTarget.value)}
          leftSection ={<Youtube size={20} color="#EF4444" />}
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
          disabled={isLoading || !url.trim()}
          size="md"
          radius="md"
          variant="filled"
          color="indigo"
          leftSection={isLoading ? <Loader size={20} color="white" /> : null}
          style={(theme) => ({
            minWidth: '120px', // Ensure button has consistent width
            transition: 'all 0.3s ease',
            '&:hover': {
              transform: 'scale(1.03)',
            },
            '&:active': {
              transform: 'scale(0.97)',
            },
            '&[data-disabled]': {
              backgroundColor: theme.colors.indigo[5], // Keep color consistent when disabled
              opacity: 0.5,
              cursor: 'not-allowed',
              transform: 'none',
              boxShadow: 'none',
            },
          })}
        >
          {isLoading ? 'Loading...' : 'Load Video'}
        </Button>
      </Group>
    </form>
  );
};

export default VideoInput;
