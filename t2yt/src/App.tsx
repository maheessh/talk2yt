// src/App.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
// Mantine UI Imports
import {
  AppShell, Container, Grid, Group, Stack, Text, Title,
  TextInput, Button, Card, Loader, Alert, Space, Badge
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

// Lucide Icons (Mantine is compatible)
import { Youtube, Send, User, Bot, Loader2, BookOpen, Tag, Info } from 'lucide-react';

// Import child components
import VideoInput from './components/VideoInput';
import VideoInfoDisplay from './components/VideoInfoDisplay';
import ChatInterface from './components/ChatInterface';

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
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const playerRef = useRef<any>(null);

  // Define your backend URL here
  const BACKEND_URL = 'http://127.0.0.1:5000'; // This MUST match where your Flask app is running

  // Responsive check for layout
  const isLargeScreen = useMediaQuery('(min-width: 1024px)'); // Mantine hook for media queries

  // Function to load YouTube Iframe Player API script
  useEffect(() => {
    if (!window.YT && !document.getElementById('youtube-iframe-api')) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      tag.id = 'youtube-iframe-api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }

    window.onYouTubeIframeAPIReady = () => {
      if (videoData?.videoId) {
        playerRef.current = new window.YT.Player('youtube-player', {
          videoId: videoData.videoId,
          events: {
            'onReady': (event: any) => console.log('YouTube Player Ready:', event.target),
            'onStateChange': (event: any) => console.log('YouTube Player State Change:', event.data)
          }
        });
      }
    };

    return () => {
      delete window.onYouTubeIframeAPIReady;
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        playerRef.current.destroy();
        playerRef.current = null;
      }
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

      if (window.YT && window.YT.Player) {
        if (playerRef.current) {
          playerRef.current.destroy();
        }
        playerRef.current = new window.YT.Player('youtube-player', {
          videoId: videoDataFetched.videoId,
          events: {
            'onReady': (event: any) => console.log('YouTube Player Ready (post-load):', event.target),
            'onStateChange': (event: any) => console.log('YouTube Player State Change (post-load):', event.data)
          }
        });
      }

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
    <Container size="xl" py="lg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Stack align="center" justify="md" mb="xl">
        <Title order={1} style={{ fontSize: isLargeScreen ? '3.5rem' : '2.5rem', fontWeight: 800, color: '#6366F1', lineHeight: 1.2, letterSpacing: '-0.025em', textShadow: '0 4px 8px rgba(0,0,0,0.3)' }}>
          <Group justify="md" styles={{}}>
            <Youtube size={isLargeScreen ? 56 : 40} color="#EF4444" />
            <Text component="span" inherit>Chat with Your YouTube Video</Text>
          </Group>
        </Title>
        <Text color="dimmed" size={isLargeScreen ? "lg" : "md"}>
          Unlock insights and engage with video content like never before.
        </Text>
      </Stack>

      <Grid style={{ flexGrow: 1 }} gutter="xl">
        {/* Left Pane: Video Input, Player, Info, Summary, Topics */}
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Stack justify="lg">
            <VideoInput onLoadVideo={handleLoadVideo} isLoading={isLoading} />

            {/* Global Error Message Display */}
            {error && (
              <Alert icon={<Info size={24} />} title="An Issue Occurred!" color="red" variant="filled" radius="md">
                <Text size="sm">{error}</Text>
                <Text size="xs" mt="xs">Ensure your Python backend is running and you are using a video with enabled transcripts.</Text>
              </Alert>
            )}

            {/* Initial Loading Overlay / Placeholder */}
            {isLoading && !videoData ? (
              <Card shadow="xl" radius="md" p="xl" withBorder
                style={(theme) => ({
                  height: '320px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: theme.colors.dark[8],
                  borderColor: theme.colors.gray[7],
                  animation: 'pulse 2s infinite',
                  '@keyframes pulse': {
                    '0%': { opacity: 1 },
                    '50%': { opacity: 0.7 },
                    '100%': { opacity: 1 },
                  }
                })}
              >
                <Loader color="indigo" size="xl" style={{ animation: 'spin 1s linear infinite' }} />
                <Space h="md" />
                <Title order={3} style={{color: "indigo", fontSize: '1.5rem', fontWeight: 500}} >
                  Loading video, transcript, summary, and topics...
                </Title>
                <Text color="dimmed" size="sm" mt="xs">This may take a moment depending on video length and API response times.</Text>
              </Card>
            ) : videoData ? (
              // Display video player and info only when data is available
              <>
                {/* Video Player container */}
                <Card shadow="xl" radius="md" p={0} withBorder
                  style={(theme) => ({
                    height: 0, paddingBottom: '56.25%', // 16:9 aspect ratio
                    position: 'relative', overflow: 'hidden',
                    backgroundColor: theme.colors.dark[8],
                    borderColor: theme.colors.indigo[7],
                  })}
                >
                  <div id="youtube-player" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                    {/* Placeholder inside player until YT API loads */}
                    {!playerRef.current && (
                      <Stack align="center" justify="center" style={(theme) => ({
                        position: 'absolute', inset: 0, backgroundColor: theme.colors.dark[8], color: theme.colors.gray[4],
                        animation: 'pulse 2s infinite',
                        '@keyframes pulse': {
                          '0%': { opacity: 1 },
                          '50%': { opacity: 0.7 },
                          '100%': { opacity: 1 },
                        }
                      })}>
                        <Loader color="indigo" size="lg" style={{ animation: 'spin 1s linear infinite', marginRight: '0.75rem' }} />
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
              <Card shadow="xl" radius="md" p="xl" withBorder
                style={(theme: { colors: { dark: any[]; gray: any[]; }; }) => ({
                  height: '320px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: theme.colors.dark[8],
                  borderColor: theme.colors.gray[7],
                  textAlign: 'center'
                })}
              >
                <Youtube size={64} color="#EF4444" style={{ marginBottom: '1rem' }} />
                <Title order={3} style={{ fontWeight: 600, color: '#94A3B8' }}>Enter a YouTube URL above to start chatting!</Title>
                <Text size="sm" color="dimmed" mt="xs">Get summaries, extract topics, and ask questions about your videos.</Text>
              </Card>
            )}
          </Stack>
        </Grid.Col>

        {/* Right Pane: Chat Interface */}
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Card shadow="xl" radius="md" p="md" withBorder style={(theme) => ({
            flexGrow: 1, display: 'flex', flexDirection: 'column',
            backgroundColor: theme.colors.dark[8],
            borderColor: theme.colors.indigo[7],
          })}>
            {videoData ? (
              <ChatInterface messages={chatMessages} onSendMessage={handleSendMessage} isLoading={isLoading} onSeekVideo={seekVideo} />
            ) : (
              <Stack align="center" justify="center" style={{ flexGrow: 1, textAlign: 'center', color: '#94A3B8' }}>
                <Title order={3} style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem' }}>Your AI Chat Assistant</Title>
                <Text size="md">Once a video is loaded, this is where you'll interact with it.</Text>
              </Stack>
            )}
          </Card>
        </Grid.Col>
      </Grid>
    </Container>
  );
};

export default App;
