import React, { useState } from 'react';
import { TextInput, Button, Group, Loader, Card, Text, Stack, useMantineTheme } from '@mantine/core';
import { Youtube } from 'lucide-react'; // Assuming lucide-react is installed

interface VideoInputProps {
  onLoadVideo: (url: string) => void;
  isLoading: boolean;
}

const VideoInput: React.FC<VideoInputProps> = ({ onLoadVideo, isLoading }) => {
  const [url, setUrl] = useState<string>('');
  const theme = useMantineTheme();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onLoadVideo(url);
    }
  };

  return (
    // Card component provides a professional, contained look with shadow and rounded corners
    <Card
      padding="xl" // Increased padding for a more spacious feel
      radius="lg" // Larger radius for a softer, modern look
      shadow="xl" // Deeper shadow for a more premium, floating effect
      withBorder // Add a subtle border for definition
      style={{
        backgroundColor: theme.colors.dark[8], // Consistent dark background
        borderColor: theme.colors.gray[7], // Subtle border color
        maxWidth: '700px', // Max width to prevent it from stretching too wide on large screens
        width: '100%', // Full width up to maxWidth
        margin: '0 auto', // Center the card horizontally
        boxSizing: 'border-box', // Ensure padding doesn't add to total width
      }}
    >
      <Stack gap="lg"> {/* Stack for vertical spacing between elements */}
        <Text
          size="xl" // Larger text for prominence
          fw={700} // Bold font weight
          c={theme.colors.gray[0]} // Light color for dark background
          ta="center" // Center align text
          style={{
            marginBottom: theme.spacing.md, // Space below the heading
            letterSpacing: '-0.02em', // Slightly tighter letter spacing for modern look
          }}
        >
          Unlock Insights from YouTube Videos
        </Text>

        <form onSubmit={handleSubmit}>
          <Group
            grow // Ensures TextInput takes available space
            align="center"
            gap="md" // Spacing between input and button
            style={{
              // Responsive flex direction change for small screens
              flexDirection: 'column',
              [`@media (min-width: ${theme.breakpoints.sm})`]: {
                flexDirection: 'row',
              },
            }}
          >
            <TextInput
              placeholder="Enter YouTube video URL (e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ)"
              value={url}
              onChange={(event) => setUrl(event.currentTarget.value)}
              leftSection={<Youtube size={20} color="#EF4444" />} // YouTube icon
              radius="md"
              size="md"
              variant="filled" // Filled variant for better contrast
              disabled={isLoading}
              style={{
                flexGrow: 1, // Allows input to take up most of the space
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
            />
            <Button
              type="submit"
              disabled={isLoading || !url.trim()}
              size="md"
              radius="md"
              variant="gradient" // Gradient variant for a more premium look
              gradient={{ from: 'indigo', to: 'blue', deg: 45 }} // Custom gradient
              leftSection={isLoading ? <Loader size={20} color="white" /> : null}
              style={{
                minWidth: '150px', // Increased min-width for better button presence
                transition: 'all 0.3s ease', // Smooth transitions for hover/active
                '&:hover': {
                  transform: 'translateY(-2px)', // Subtle lift on hover
                  boxShadow: theme.shadows.lg, // Larger shadow on hover
                },
                '&:active': {
                  transform: 'translateY(0)', // Push down on click
                },
                '&[data-disabled]': {
                  // Maintain gradient but reduce opacity when disabled
                  background: `linear-gradient(45deg, ${theme.colors.indigo[5]} 0%, ${theme.colors.blue[5]} 100%)`,
                  opacity: 0.6,
                  cursor: 'not-allowed',
                  transform: 'none',
                  boxShadow: 'none',
                },
              }}
            >
              {isLoading ? 'Processing...' : 'Analyze Video'} {/* More action-oriented text */}
            </Button>
          </Group>
        </form>
      </Stack>
    </Card>
  );
};

export default VideoInput;
