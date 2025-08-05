import React, { useState, useRef, useEffect, useCallback } from 'react';
// Mantine UI Imports
import {
  Container, Grid, Group, Stack, Text, Title,
  Card, Loader, Alert, Space, useMantineTheme, Box, ActionIcon, Anchor, // Anchor is now used for the footer link
} from '@mantine/core';
import { useMantineColorScheme } from '@mantine/core'; // Import useMantineColorScheme

// Lucide Icons (Mantine is compatible)
import { Youtube, Info, Sparkles, Sun, Moon } from 'lucide-react'; // Added Sparkles, Sun, Moon for AI theme and theme toggle

// Import child components
import VideoInput from './components/VideoInput';
import VideoInfoDisplay from './components/VideoInfoDisplay';
import ChatInterface from './components/ChatInterface';
import { useMediaQuery } from '@mantine/hooks';

// Define interfaces (no change)
interface VideoData {
  title: string;
  description: string;
  transcript: string;
  videoId: string;
  summary?: string;
  topics?: string[];
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestampSeconds?: number;
}

// Global variable for YouTube Player (managed by Iframe Player API) (no change)
declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT: any; // YouTube Player API object
  }
}

// --- Main App Component ---
const App: React.FC = () => {
  const [, setVideoUrl] = useState<string>('');
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const playerRef = useRef<any>(null);
  const theme = useMantineTheme(); // Access Mantine theme for consistent styling
  const { colorScheme, toggleColorScheme } = useMantineColorScheme(); // Theme toggle hook

  // Define your backend URL here
  const BACKEND_URL = 'http://127.00.0.1:5000'; // This MUST match where your Flask app is running

  // Responsive check for layout
  const isLargeScreen = useMediaQuery('(min-width: 1024px)'); // Mantine hook for media queries

  // Function to load YouTube Iframe Player API script
  useEffect(() => {
    const loadYouTubeAPI = () => {
      if (!window.YT && !document.getElementById('youtube-iframe-api')) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        tag.id = 'youtube-iframe-api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      }
    };

    loadYouTubeAPI();

    window.onYouTubeIframeAPIReady = () => {
      if (videoData?.videoId) {
        if (playerRef.current) {
          playerRef.current.destroy();
        }
        playerRef.current = new window.YT.Player('youtube-player', {
          videoId: videoData.videoId,
          events: {
            'onReady': (event: any) => console.log('YouTube Player Ready:', event.target),
            'onStateChange': (event: any) => console.log('YouTube Player State Change:', event.data)
          }
        });
      }
    };

    if (window.YT && videoData?.videoId) {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
      playerRef.current = new window.YT.Player('youtube-player', {
        videoId: videoData.videoId,
        events: {
          'onReady': (event: any) => console.log('YouTube Player Ready:', event.target),
          'onStateChange': (event: any) => console.log('YouTube Player State Change:', event.data)
        }
      });
    }


    return () => {
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      delete window.onYouTubeIframeAPIReady;
    };
  }, [videoData?.videoId]);

  const seekVideo = useCallback((seconds: number) => {
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(seconds, true);
      playerRef.current.playVideo();
    } else {
      console.warn("YouTube Player not ready or seekTo function not available.");
      setChatMessages((prev) => [...prev, { id: Date.now().toString() + 'seek_err', sender: 'ai', text: 'Video player not ready to seek. Please ensure the video is loaded and the YouTube Player API has initialized.' }]);
    }
  }, []);

  const handleLoadVideo = async (url: string) => {
    setVideoUrl(url);
    setVideoData(null);
    setChatMessages([]);
    setIsLoading(true);
    setError(null);

    try {
      const videoInfoResponse = await fetch(`${BACKEND_URL}/api/extract-video-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: url }),
      });

      if (!videoInfoResponse.ok) {
        const errorData = await videoInfoResponse.json();
        throw new Error(errorData.error || `Server responded with status: ${videoInfoResponse.status} ${videoInfoResponse.statusText}`);
      }

      const videoDataFetched = await videoInfoResponse.json();

      const [summaryResult, topicsResult] = await Promise.allSettled([
        fetch(`${BACKEND_URL}/api/summarize-video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_transcript: videoDataFetched.transcript }),
        }),
        fetch(`${BACKEND_URL}/api/extract-topics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_transcript: videoDataFetched.transcript }),
        })
      ]);

      let summary: string | undefined;
      if (summaryResult.status === 'fulfilled' && summaryResult.value.ok) {
        const summaryData = await summaryResult.value.json();
        summary = summaryData.summary;
      } else if (summaryResult.status === 'rejected') {
        console.error("Failed to fetch summary (rejected promise):", summaryResult.reason);
      } else if (summaryResult.status === 'fulfilled' && !summaryResult.value.ok) {
        const errorData = await summaryResult.value.json();
        console.error("Failed to fetch summary (server error):", errorData.error);
      }

      let topics: string[] | undefined;
      if (topicsResult.status === 'fulfilled' && topicsResult.value.ok) {
        const topicsData = await topicsResult.value.json();
        topics = topicsData.topics;
      } else if (topicsResult.status === 'rejected') {
        console.error("Failed to fetch topics (rejected promise):", topicsResult.reason);
      } else if (topicsResult.status === 'fulfilled' && !topicsResult.value.ok) {
        const errorData = await topicsResult.value.json();
        console.error("Failed to fetch topics (server error):", errorData.error);
      }

      setVideoData({
        title: videoDataFetched.title,
        description: videoDataFetched.description,
        transcript: videoDataFetched.transcript,
        videoId: videoDataFetched.videoId,
        summary: summary,
        topics: topics,
      });

      setChatMessages([{ id: 'welcome', sender: 'ai', text: `Hello! I've loaded "${videoDataFetched.title}". How can I help you with this video?` }]);

    } catch (err: any) {
      setError(`Error: ${err.message}. Please check video URL, backend status, and console for details.`);
      console.error('Video load process error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const parseTimestamp = (text: string): { text: string; timestampSeconds?: number } => {
    const timestampRegex = /\[(\d{2}):(\d{2}):(\d{2})\]/;
    const match = text.match(timestampRegex);

    if (match) {
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const seconds = parseInt(match[3], 10);
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      const cleanText = text.replace(timestampRegex, '').trim();
      return { text: cleanText, timestampSeconds: totalSeconds };
    }
    return { text: text };
  };

  const handleSendMessage = async (message: string) => {
    if (!videoData || !message.trim()) return;

    const newUserMessage: ChatMessage = { id: Date.now().toString(), sender: 'user', text: message };
    setChatMessages((prev) => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat-with-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_query: message,
          video_transcript: videoData.transcript,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server responded with status: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const { text: aiResponseText, timestampSeconds } = parseTimestamp(data.response);

      const aiResponse: ChatMessage = {
        id: Date.now().toString() + 'ai',
        sender: 'ai',
        text: aiResponseText,
        timestampSeconds: timestampSeconds
      };
      setChatMessages((prev) => [...prev, aiResponse]);

    } catch (err: any) {
      setError(`AI Chat Error: ${err.message}.`);
      console.error('Chat error:', err);
      setChatMessages((prev) => [...prev, { id: Date.now().toString() + 'err', sender: 'ai', text: 'Sorry, I could not process your request at the moment due to an issue. Please try again or check the console for details.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTopicClick = (topic: string) => {
    const query = `What does the video say about "${topic}"?`;
    handleSendMessage(query);
  };

  return (
    // Main container with a dark, professional background and subtle gradient
    <Box
      style={{
        minHeight: '100vh',
        backgroundColor: colorScheme === 'dark' ? theme.colors.dark[9] : theme.colors.gray[0], // Adjust background based on theme
        backgroundImage: colorScheme === 'dark'
          ? `linear-gradient(180deg, ${theme.colors.dark[8]} 0%, ${theme.colors.dark[9]} 100%)`
          : `linear-gradient(180deg, ${theme.colors.gray[1]} 0%, ${theme.colors.gray[0]} 100%)`, // Light theme gradient
        padding: theme.spacing.xl,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: 'Inter, sans-serif', // Professional font
      }}
    >
      <Container size="xl" py="lg" style={{ flexGrow: 1, width: '100%' }}>
        {/* Header Section: Talk2YT Branding */}
        <Stack align="center" justify="center" mb="xl" style={{
          paddingTop: theme.spacing.xl,
          paddingBottom: theme.spacing.md,
          animation: 'fadeInDown 1s ease-out', // Simple fade-in animation
          '@keyframes fadeInDown': {
            'from': { opacity: 0, transform: 'translateY(-20px)' },
            'to': { opacity: 1, transform: 'translateY(0)' },
          }
        }}>
          <Group justify="center" gap="xs">
            <Youtube size={isLargeScreen ? 64 : 48} color="#EF4444" /> {/* YouTube icon */}
            <Title
              order={1}
              style={{
                fontSize: isLargeScreen ? '4.5rem' : '3rem', // Larger, bolder title
                fontWeight: 900,
                lineHeight: 1,
                letterSpacing: '-0.05em',
                background: `linear-gradient(45deg, ${theme.colors.indigo[4]} 0%, ${theme.colors.blue[6]} 100%)`, // Gradient text
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textShadow: `0 6px 12px rgba(26, 0, 74, 0.3)`, // Using a direct rgba for dark indigo
              }}
            >
              Talk2YT
            </Title>
            <Sparkles size={isLargeScreen ? 40 : 30} color={theme.colors.yellow[5]} style={{ marginLeft: theme.spacing.xs }} /> {/* AI Sparkle icon */}
          </Group>
          <Text
            c={colorScheme === 'dark' ? theme.colors.gray[3] : theme.colors.gray[7]} // Adjust tagline color based on theme
            size={isLargeScreen ? "xl" : "lg"}
            fw={500}
            style={{
              marginTop: theme.spacing.sm,
              textAlign: 'center',
              maxWidth: '600px',
              animation: 'fadeIn 1.5s ease-out', // Delayed fade-in for tagline
              '@keyframes fadeIn': {
                'from': { opacity: 0 },
                'to': { opacity: 1 },
              }
            }}
          >
            Your AI Companion for Deep YouTube Video Insights.
          </Text>
          {/* Theme Toggle Button */}
          <ActionIcon
            variant="default"
            onClick={toggleColorScheme}
            size="lg"
            aria-label="Toggle color scheme"
            style={{
              marginTop: theme.spacing.md,
              backgroundColor: colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[2],
              color: colorScheme === 'dark' ? theme.colors.yellow[5] : theme.colors.blue[6],
              borderColor: colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[4],
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'scale(1.1)',
                backgroundColor: colorScheme === 'dark' ? theme.colors.dark[5] : theme.colors.gray[3],
              }
            }}
          >
            {colorScheme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </ActionIcon>
        </Stack>

        {/* Main Content Grid */}
        <Grid style={{ flexGrow: 1 }} gutter="xl">
          {/* Left Pane: Video Input, Player, Info, Summary, Topics */}
          <Grid.Col span={{ base: 12, lg: 8 }}>
            <Stack gap="xl"> {/* Increased gap for more breathing room */}
              <VideoInput onLoadVideo={handleLoadVideo} isLoading={isLoading} />

              {/* Global Error Message Display */}
              {error && (
                <Alert
                  icon={<Info size={24} />}
                  title="An Issue Occurred!"
                  color="red"
                  variant="filled"
                  radius="md"
                  style={{
                    backgroundColor: theme.colors.red[8], // Darker red for error
                    borderColor: theme.colors.red[6],
                    animation: 'shake 0.5s', // Subtle shake animation on error
                    '@keyframes shake': {
                      '0%': { transform: 'translateX(0)' },
                      '25%': { transform: 'translateX(-5px)' },
                      '50%': { transform: 'translateX(5px)' },
                      '75%': { transform: 'translateX(-5px)' },
                      '100%': { transform: 'translateX(0)' },
                    }
                  }}
                >
                  <Text size="sm">{error}</Text>
                  <Text size="xs" mt="xs" c={theme.colors.red[1]}>Ensure your Python backend is running and you are using a video with enabled transcripts.</Text>
                </Alert>
              )}

              {/* Initial Loading Overlay / Placeholder */}
              {isLoading && !videoData ? (
                <Card
                  shadow="xl"
                  radius="lg" // Larger radius for consistency
                  p="xl"
                  withBorder
                  style={{
                    minHeight: '320px', // Ensure consistent height
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0], // Adjust card background
                    borderColor: colorScheme === 'dark' ? theme.colors.gray[7] : theme.colors.gray[3], // Adjust border color
                    animation: 'pulseGlow 2s infinite alternate', // Pulsing glow animation
                    '@keyframes pulseGlow': {
                      '0%': { boxShadow: `0 0 15px rgba(99, 102, 241, 0.4)` },
                      '100%': { boxShadow: `0 0 25px rgba(99, 102, 241, 0.7)` },
                    }
                  }}
                >
                  <Loader color="indigo" size="xl" />
                  <Space h="md" />
                  <Title order={3} style={{ color: theme.colors.indigo[4], fontSize: '1.8rem', fontWeight: 600 }} >
                    Analyzing Video Content...
                  </Title>
                  <Text c={colorScheme === 'dark' ? theme.colors.gray[4] : theme.colors.gray[6]} size="md" mt="xs" ta="center">This may take a moment depending on video length and API response times.</Text>
                </Card>
              ) : videoData ? (
                // Display video player and info only when data is available
                <>
                  {/* Video Player container */}
                  <Card
                    shadow="xl"
                    radius="lg" // Consistent radius
                    p={0}
                    withBorder
                    style={{
                      height: 0, paddingBottom: '56.25%', // 16:9 aspect ratio
                      position: 'relative', overflow: 'hidden',
                      backgroundColor: colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0], // Adjust player background
                      borderColor: colorScheme === 'dark' ? theme.colors.indigo[7] : theme.colors.indigo[4], // Adjust border color
                      transition: 'border-color 0.3s ease',
                      '&:hover': {
                        borderColor: theme.colors.indigo[5], // Highlight on hover
                      }
                    }}
                  >
                    <div id="youtube-player" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                      {/* Placeholder inside player until YT API loads */}
                      {!playerRef.current && (
                        <Stack align="center" justify="center" style={{
                          position: 'absolute', inset: 0,
                          backgroundColor: colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0], // Adjust placeholder background
                          color: colorScheme === 'dark' ? theme.colors.gray[4] : theme.colors.gray[6], // Adjust placeholder text color
                          animation: 'pulseOpacity 1.5s infinite alternate', // Subtle pulse for player placeholder
                          '@keyframes pulseOpacity': {
                            '0%': { opacity: 0.7 },
                            '100%': { opacity: 1 },
                          }
                        }}>
                          <Loader color="indigo" size="lg" />
                          <Text>Initializing video player...</Text>
                        </Stack>
                      )}
                    </div>
                  </Card>

                  <VideoInfoDisplay
                    title={videoData.title}
                    description={videoData.description}
                    summary={videoData.summary}
                    topics={videoData.topics}
                    onTopicClick={handleTopicClick}
                  />
                </>
              ) : (
                // Initial welcome message before any video is loaded
                <Card
                  shadow="xl"
                  radius="lg" // Consistent radius
                  p="xl"
                  withBorder
                  style={{
                    minHeight: '320px', // Consistent height
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0], // Adjust card background
                    borderColor: colorScheme === 'dark' ? theme.colors.gray[7] : theme.colors.gray[3], // Adjust border color
                    textAlign: 'center',
                    animation: 'fadeInUp 1s ease-out', // Fade-in from bottom
                    '@keyframes fadeInUp': {
                      'from': { opacity: 0, transform: 'translateY(20px)' },
                      'to': { opacity: 1, transform: 'translateY(0)' },
                    }
                  }}
                >
                  <Youtube size={64} color="#EF4444" style={{ marginBottom: theme.spacing.lg }} />
                  <Title order={3} style={{ fontWeight: 700, color: colorScheme === 'dark' ? theme.colors.gray[2] : theme.colors.gray[8], fontSize: '1.75rem' }}>
                    Start by Entering a YouTube URL!
                  </Title>
                  <Text size="md" c={colorScheme === 'dark' ? theme.colors.gray[4] : theme.colors.gray[6]} mt="xs" style={{ maxWidth: '400px' }}>
                    Get instant summaries, extract key topics, and chat directly with your video content using AI.
                  </Text>
                </Card>
              )}
            </Stack>
          </Grid.Col>

          {/* Right Pane: Chat Interface */}
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Card
              shadow="xl"
              radius="lg" // Consistent radius
              p="md"
              withBorder
              style={{
                flexGrow: 1, display: 'flex', flexDirection: 'column',
                backgroundColor: colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0], // Adjust card background
                borderColor: colorScheme === 'dark' ? theme.colors.indigo[7] : theme.colors.indigo[4], // Adjust border color
                minHeight: isLargeScreen ? 'calc(100vh - 200px)' : '400px', // Dynamic height for chat
                transition: 'border-color 0.3s ease',
                '&:hover': {
                  borderColor: theme.colors.indigo[5], // Highlight on hover
                }
              }}
            >
              {videoData ? (
                <ChatInterface messages={chatMessages} onSendMessage={handleSendMessage} isLoading={isLoading} onSeekVideo={seekVideo} />
              ) : (
                <Stack align="center" justify="center" style={{ flexGrow: 1, textAlign: 'center', color: colorScheme === 'dark' ? theme.colors.gray[4] : theme.colors.gray[6] }}>
                  <Sparkles size={64} color={theme.colors.yellow[5]} style={{ marginBottom: theme.spacing.lg }} />
                  <Title order={3} style={{ fontSize: '2rem', fontWeight: 700, marginBottom: theme.spacing.md, color: colorScheme === 'dark' ? theme.colors.gray[2] : theme.colors.gray[8] }}>
                    Your AI Assistant Awaits
                  </Title>
                  <Text size="md" c={colorScheme === 'dark' ? theme.colors.gray[4] : theme.colors.gray[6]} style={{ maxWidth: '300px' }}>
                    Once a video is loaded, this is where you'll interact with our intelligent AI chat.
                  </Text>
                </Stack>
              )}
            </Card>
          </Grid.Col>
        </Grid>

        {/* Footer */}
        <Text
          c={colorScheme === 'dark' ? theme.colors.gray[6] : theme.colors.gray[7]} // Adjust footer text color
          size="sm"
          ta="center"
          mt="xl"
          style={{
            paddingTop: theme.spacing.md,
            borderTop: `1px solid ${colorScheme === 'dark' ? theme.colors.dark[7] : theme.colors.gray[3]}`, // Adjust border color
            animation: 'fadeInUp 1s ease-out 0.5s forwards', // Delayed fade-in
            '@keyframes fadeInUp': {
              'from': { opacity: 0, transform: 'translateY(20px)' },
              'to': { opacity: 1, transform: 'translateY(0)' },
            }
          }}
        >
          &copy; {new Date().getFullYear()} Talk2YT. All rights reserved. Built by{' '}
          <Anchor // Changed from Text component="a" to Anchor
            href="https://maheshpandit.com.np"
            target="_blank"
            rel="noopener noreferrer"
            c={theme.colors.indigo[4]} // Link color
            fw={600}
            // sx={{ // sx prop is fully supported by Anchor
            //   textDecoration: 'none',
            //   transition: 'color 0.2s ease',
            //   '&:hover': {
            //     color: theme.colors.indigo[2], // Lighter on hover
            //     textDecoration: 'underline',
            //   },
            // }}
          >
            Mahesh Raj Pandit
          </Anchor>
          .
        </Text>
      </Container>
    </Box>
  );
};

export default App;
