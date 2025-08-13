import React, { useState, useRef, useEffect, useCallback } from "react";
// Mantine UI Imports
import {
  Container,
  Grid,
  Group,
  Stack,
  Text,
  Title,
  Card,
  Loader,
  Alert,
  Space,
  useMantineTheme,
  Box,
  ActionIcon,
  Anchor,
} from "@mantine/core";
import { useMantineColorScheme } from "@mantine/core";

// Lucide Icons
import { Youtube, Info, Sparkles, Sun, Moon } from "lucide-react";

// Import child components
import VideoInput from "./components/VideoInput";
import VideoInfoDisplay from "./components/VideoInfoDisplay";
import ChatInterface from "./components/ChatInterface";
import { useMediaQuery } from "@mantine/hooks";
import VideoPlayer from "./components/VideoPlayer";

// === ADDED: typed transcript item for raw list from backend
interface TranscriptItem {
  text: string;
  start: number;
  duration?: number;
}

// Define interfaces (kept, but extended)
interface VideoData {
  title: string;
  description: string;
  transcript: string;
  videoId: string;
  summary?: string;
  topics?: string[];
  // === ADDED: raw transcript list with timestamps
  transcript_list?: TranscriptItem[];
}

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestampSeconds?: number;
}

// Global variable for YouTube Player (managed by Iframe Player API)
declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT: any;
  }
}

// === ADDED: Robust timestamp regex supporting [HH:MM:SS] and [MM:SS]
const TS_ANY = /\[(\d{2}):(\d{2})(?::(\d{2}))?\]/;

const App: React.FC = () => {
  const [, setVideoUrl] = useState<string>("");
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const playerRef = useRef<any>(null);
  const theme = useMantineTheme();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  // === ADDED: track player readiness to avoid seek errors

  // Responsive check for layout
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");

  // Track readiness + queued seeks without touching `window`
  const playerReadyRef = useRef<boolean>(false);
  const readyWaitersRef = useRef<Array<() => void>>([]);
  const pendingSeekRef = useRef<number | null>(null);

  // REPLACE your current useEffect that loads & creates the YT player with this:
  useEffect(() => {
    // mark all waiters as ready
    const resolveReady = () => {
      playerReadyRef.current = true;
      const waiters = [...readyWaitersRef.current];
      readyWaitersRef.current.length = 0;
      waiters.forEach((fn) => {
        try {
          fn();
        } catch {}
      });
    };

    const loadYouTubeAPI = () => {
      if (!window.YT && !document.getElementById("youtube-iframe-api")) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        tag.id = "youtube-iframe-api";
        const firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      }
    };

    const createPlayer = () => {
      if (!videoData?.videoId) return;

      // destroy old
      if (playerRef.current?.destroy) {
        try {
          playerRef.current.destroy();
        } catch {}
        playerRef.current = null;
      }

      // reset readiness for this instance
      playerReadyRef.current = false;

      playerRef.current = new window.YT.Player("youtube-player", {
        videoId: videoData.videoId,
        playerVars: {
          enablejsapi: 1,
          origin: window.location.origin,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
        },
        events: {
          onReady: (event: any) => {
            console.log("YouTube Player Ready:", event.target);
            resolveReady();

            // flush any queued seek
            if (pendingSeekRef.current != null) {
              try {
                event.target.seekTo(pendingSeekRef.current, true);
                event.target.playVideo?.();
              } catch (e) {
                console.warn("Flushing queued seek failed:", e);
              }
              pendingSeekRef.current = null;
            }
          },
          onStateChange: (event: any) => {
            console.log("YouTube Player State Change:", event.data);
          },
          onError: (err: any) => {
            console.error("YouTube Player Error:", err);
          },
        },
      });
    };

    loadYouTubeAPI();

    if (window.YT?.Player) {
      createPlayer();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        try {
          prev && prev();
        } catch {}
        createPlayer();
      };
    }

    return () => {
      if (playerRef.current?.destroy) {
        try {
          playerRef.current.destroy();
        } catch {}
        playerRef.current = null;
      }
    };
  }, [videoData?.videoId]);

  // helper for pretty timestamps
  const toHMS = (total: number) => {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(
      2,
      "0"
    )}:${String(s).padStart(2, "0")}`;
  };

  // REPLACE your existing seekVideo with this robust version:
  const seekVideo = useCallback(
    async (seconds: number) => {
      // share the same refs we created in the useEffect above
      // @ts-ignore
      const playerReadyRef = (window.__yt_playerReadyRef as {
        current: boolean;
      }) ?? { current: false };
      // @ts-ignore
      const readyWaitersRef = (window.__yt_readyWaitersRef as {
        current: Array<() => void>;
      }) ?? { current: [] };
      // @ts-ignore
      const pendingSeekRef = (window.__yt_pendingSeekRef as {
        current: number | null;
      }) ?? { current: null };

      const waitUntilReady = () =>
        playerReadyRef.current
          ? Promise.resolve()
          : new Promise<void>((res) => readyWaitersRef.current.push(res));

      // If player object isn’t there yet, queue it and inform the user once (friendly)
      if (!window.YT || !playerRef.current) {
        pendingSeekRef.current = seconds;
        setChatMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString() + "queued_jump",
            sender: "ai",
            text: `Player is initializing — I’ll jump to [${toHMS(
              seconds
            )}] as soon as it’s ready.`,
          },
        ]);
        return;
      }

      // If player exists but not yet ready, queue and wait
      if (!playerReadyRef.current) {
        pendingSeekRef.current = seconds;
        setChatMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString() + "queued_jump2",
            sender: "ai",
            text: `Queued jump to [${toHMS(seconds)}] — just finishing setup…`,
          },
        ]);
        await waitUntilReady();
      }

      try {
        if (typeof playerRef.current.seekTo === "function") {
          playerRef.current.seekTo(seconds, true);
          playerRef.current.playVideo?.();
        } else {
          // very rare: methods not present yet — queue
          pendingSeekRef.current = seconds;
        }
      } catch (e) {
        console.warn("Seek failed; queuing for retry:", e);
        pendingSeekRef.current = seconds;
      }
    },
    [setChatMessages]
  );

  const handleLoadVideo = async (url: string) => {
    setVideoUrl(url);
    setVideoData(null);
    setChatMessages([]);
    setIsLoading(true);
    setError(null);

    try {
      const videoInfoResponse = await fetch("/api/extract-video-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_url: url }),
      });

      if (!videoInfoResponse.ok) {
        const errorData = await videoInfoResponse.json();
        throw new Error(
          errorData.error ||
            `Server responded with status: ${videoInfoResponse.status}`
        );
      }

      const videoDataFetched = await videoInfoResponse.json();

      const [summaryResult, topicsResult] = await Promise.allSettled([
        fetch("/api/summarize-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_transcript: videoDataFetched.transcript,
          }),
        }),
        fetch("/api/extract-topics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_transcript: videoDataFetched.transcript,
          }),
        }),
      ]);

      let summary: string | undefined;
      if (summaryResult.status === "fulfilled" && summaryResult.value.ok) {
        const summaryData = await summaryResult.value.json();
        summary = summaryData.summary;
      } else {
        console.error("Failed to fetch summary:", summaryResult);
      }

      let topics: string[] | undefined;
      if (topicsResult.status === "fulfilled" && topicsResult.value.ok) {
        const topicsData = await topicsResult.value.json();
        topics = topicsData.topics;
      } else {
        console.error("Failed to fetch topics:", topicsResult);
      }

      setVideoData({
        title: videoDataFetched.title,
        description: videoDataFetched.description,
        transcript: videoDataFetched.transcript,
        videoId: videoDataFetched.videoId,
        summary,
        topics,
        transcript_list: videoDataFetched.transcript_list || [], // === ADDED
      });

      setChatMessages([
        {
          id: "welcome",
          sender: "ai",
          text: `Hello! I've loaded "${videoDataFetched.title}". How can I help you?`,
        },
      ]);
    } catch (err: any) {
      setError(
        `Error: ${err.message}. Please check the video URL and backend status.`
      );
      console.error("Video load process error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // === CHANGED: more robust parsing; supports [HH:MM:SS] and [MM:SS]; removes only first match (kept behavior)
  const parseTimestamp = (
    text: string
  ): { text: string; timestampSeconds?: number } => {
    const match = text.match(TS_ANY);
    if (match) {
      const hasHH = typeof match[3] !== "undefined";
      const hh = hasHH ? parseInt(match[1], 10) : 0;
      const mm = hasHH ? parseInt(match[2], 10) : parseInt(match[1], 10);
      const ss = hasHH ? parseInt(match[3]!, 10) : parseInt(match[2]!, 10);
      const totalSeconds = hh * 3600 + mm * 60 + ss;
      const cleanText = text.replace(TS_ANY, "").trim();
      return { text: cleanText, timestampSeconds: totalSeconds };
    }
    return { text };
  };

  const handleSendMessage = async (message: string) => {
    if (!videoData || !message.trim()) return;

    const newUserMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: message,
    };
    setChatMessages((prev) => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat-with-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_query: message,
          // === CHANGED: prefer raw transcript list for best timestamp accuracy
          video_transcript_list:
            videoData.transcript_list && videoData.transcript_list.length > 0
              ? videoData.transcript_list
              : undefined,
          // Fallback so older backend still works:
          video_transcript: videoData.transcript,
          // === ADDED: short conversational memory
          conversation_history: chatMessages.slice(-8).map((m) => ({
            role: m.sender,
            text: m.text,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `Server responded with status: ${response.status}`
        );
      }

      const data = await response.json();
      const { text: aiResponseText, timestampSeconds } = parseTimestamp(
        data.response
      );

      const aiResponse: ChatMessage = {
        id: Date.now().toString() + "ai",
        sender: "ai",
        text: aiResponseText,
        timestampSeconds,
      };
      setChatMessages((prev) => [...prev, aiResponse]);

      // === ADDED (optional): gentle auto-seek to the first cited timestamp
      if (typeof timestampSeconds === "number") {
        setTimeout(() => seekVideo(timestampSeconds), 250);
      }
    } catch (err: any) {
      setError(`AI Chat Error: ${err.message}.`);
      console.error("Chat error:", err);
      setChatMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "err",
          sender: "ai",
          text: "Sorry, I could not process your request.",
        },
      ]);
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
        minHeight: "100vh",
        backgroundColor:
          colorScheme === "dark" ? theme.colors.dark[9] : theme.colors.gray[0],
        backgroundImage:
          colorScheme === "dark"
            ? `linear-gradient(180deg, ${theme.colors.dark[8]} 0%, ${theme.colors.dark[9]} 100%)`
            : `linear-gradient(180deg, ${theme.colors.gray[1]} 0%, ${theme.colors.gray[0]} 100%)`,
        padding: theme.spacing.xl,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <Container size="xl" py="lg" style={{ flexGrow: 1, width: "100%" }}>
        {/* Header Section: Talk2YT Branding */}
        <Stack
          align="center"
          justify="center"
          mb="xl"
          style={{
            paddingTop: theme.spacing.xl,
            paddingBottom: theme.spacing.md,
            animation: "fadeInDown 1s ease-out",
            "@keyframes fadeInDown": {
              from: { opacity: 0, transform: "translateY(-20px)" },
              to: { opacity: 1, transform: "translateY(0)" },
            },
          }}
        >
          <Group justify="center" gap="xs">
            <Youtube size={isLargeScreen ? 64 : 48} color="#EF4444" />
            <Title
              order={1}
              style={{
                fontSize: isLargeScreen ? "4.5rem" : "3rem",
                fontWeight: 900,
                lineHeight: 1,
                letterSpacing: "-0.05em",
                background: `linear-gradient(45deg, ${theme.colors.indigo[4]} 0%, ${theme.colors.blue[6]} 100%)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                textShadow: `0 6px 12px rgba(26, 0, 74, 0.3)`,
              }}
            >
              Talk2YT
            </Title>
            <Sparkles
              size={isLargeScreen ? 40 : 30}
              color={theme.colors.yellow[5]}
              style={{ marginLeft: theme.spacing.xs }}
            />
          </Group>
          <Text
            c={
              colorScheme === "dark"
                ? theme.colors.gray[3]
                : theme.colors.gray[7]
            }
            size={isLargeScreen ? "xl" : "lg"}
            fw={500}
            style={{
              marginTop: theme.spacing.sm,
              textAlign: "center",
              maxWidth: "600px",
              animation: "fadeIn 1.5s ease-out",
              "@keyframes fadeIn": {
                from: { opacity: 0 },
                to: { opacity: 1 },
              },
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
              backgroundColor:
                colorScheme === "dark"
                  ? theme.colors.dark[6]
                  : theme.colors.gray[2],
              color:
                colorScheme === "dark"
                  ? theme.colors.yellow[5]
                  : theme.colors.blue[6],
              borderColor:
                colorScheme === "dark"
                  ? theme.colors.dark[4]
                  : theme.colors.gray[4],
              transition: "all 0.3s ease",
              "&:hover": {
                transform: "scale(1.1)",
                backgroundColor:
                  colorScheme === "dark"
                    ? theme.colors.dark[5]
                    : theme.colors.gray[3],
              },
            }}
          >
            {colorScheme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </ActionIcon>
        </Stack>

        {/* Main Content Grid */}
        <Grid style={{ flexGrow: 1 }} gutter="xl">
          {/* Left Pane: Video Input, Player, Info, Summary, Topics */}
          <Grid.Col span={{ base: 12, lg: 8 }}>
            <Stack gap="xl">
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
                    backgroundColor: theme.colors.red[8],
                    borderColor: theme.colors.red[6],
                    animation: "shake 0.5s",
                    "@keyframes shake": {
                      "0%": { transform: "translateX(0)" },
                      "25%": { transform: "translateX(-5px)" },
                      "50%": { transform: "translateX(5px)" },
                      "75%": { transform: "translateX(-5px)" },
                      "100%": { transform: "translateX(0)" },
                    },
                  }}
                >
                  <Text size="sm">{error}</Text>
                  <Text size="xs" mt="xs" c={theme.colors.red[1]}>
                    Ensure your Python backend is running and you are using a
                    video with enabled transcripts.
                  </Text>
                </Alert>
              )}

              {/* Initial Loading Overlay / Placeholder */}
              {isLoading && !videoData ? (
                <Card
                  shadow="xl"
                  radius="lg"
                  p="xl"
                  withBorder
                  style={{
                    minHeight: "320px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor:
                      colorScheme === "dark"
                        ? theme.colors.dark[8]
                        : theme.colors.gray[0],
                    borderColor:
                      colorScheme === "dark"
                        ? theme.colors.gray[7]
                        : theme.colors.gray[3],
                    animation: "pulseGlow 2s infinite alternate",
                    "@keyframes pulseGlow": {
                      "0%": { boxShadow: `0 0 15px rgba(99, 102, 241, 0.4)` },
                      "100%": { boxShadow: `0 0 25px rgba(99, 102, 241, 0.7)` },
                    },
                  }}
                >
                  <Loader color="indigo" size="xl" />
                  <Space h="md" />
                  <Title
                    order={3}
                    style={{
                      color: theme.colors.indigo[4],
                      fontSize: "1.8rem",
                      fontWeight: 600,
                    }}
                  >
                    Analyzing Video Content...
                  </Title>
                  <Text
                    c={
                      colorScheme === "dark"
                        ? theme.colors.gray[4]
                        : theme.colors.gray[6]
                    }
                    size="md"
                    mt="xs"
                    ta="center"
                  >
                    This may take a moment depending on video length and API
                    response times.
                  </Text>
                </Card>
              ) : videoData ? (
                <>
                  {/* Video Player container */}
                  {/* Replace the <Card>…<div id="youtube-player" />…</Card> with: */}
                  <VideoPlayer
                    videoId={videoData.videoId}
                    title={videoData.title}
                    autoPlay={false}
                  />

                  <VideoInfoDisplay
                    title={videoData.title}
                    description={videoData.description}
                    summary={videoData.summary}
                    topics={videoData.topics}
                    onTopicClick={handleTopicClick}
                  />
                </>
              ) : (
                <Card
                  shadow="xl"
                  radius="lg"
                  p="xl"
                  withBorder
                  style={{
                    minHeight: "320px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor:
                      colorScheme === "dark"
                        ? theme.colors.dark[8]
                        : theme.colors.gray[0],
                    borderColor:
                      colorScheme === "dark"
                        ? theme.colors.gray[7]
                        : theme.colors.gray[3],
                    textAlign: "center",
                    animation: "fadeInUp 1s ease-out",
                    "@keyframes fadeInUp": {
                      from: { opacity: 0, transform: "translateY(20px)" },
                      to: { opacity: 1, transform: "translateY(0)" },
                    },
                  }}
                >
                  <Youtube
                    size={64}
                    color="#EF4444"
                    style={{ marginBottom: theme.spacing.lg }}
                  />
                  <Title
                    order={3}
                    style={{
                      fontWeight: 700,
                      color:
                        colorScheme === "dark"
                          ? theme.colors.gray[2]
                          : theme.colors.gray[8],
                      fontSize: "1.75rem",
                    }}
                  >
                    Start by Entering a YouTube URL!
                  </Title>
                  <Text
                    size="md"
                    c={
                      colorScheme === "dark"
                        ? theme.colors.gray[4]
                        : theme.colors.gray[6]
                    }
                    mt="xs"
                    style={{ maxWidth: "400px" }}
                  >
                    Get instant summaries, extract key topics, and chat directly
                    with your video content using AI.
                  </Text>
                </Card>
              )}
            </Stack>
          </Grid.Col>

          {/* Right Pane: Chat Interface */}
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Card
              shadow="xl"
              radius="lg"
              p="md"
              withBorder
              style={{
                flexGrow: 1,
                display: "flex",
                flexDirection: "column",
                backgroundColor:
                  colorScheme === "dark"
                    ? theme.colors.dark[8]
                    : theme.colors.gray[0],
                borderColor:
                  colorScheme === "dark"
                    ? theme.colors.indigo[7]
                    : theme.colors.indigo[4],
                minHeight: isLargeScreen ? "calc(100vh - 200px)" : "400px",
                transition: "border-color 0.3s ease",
                "&:hover": { borderColor: theme.colors.indigo[5] },
              }}
            >
              {videoData ? (
                <ChatInterface
                  messages={chatMessages}
                  onSendMessage={handleSendMessage}
                  isLoading={isLoading}
                  onSeekVideo={seekVideo}
                />
              ) : (
                <Stack
                  align="center"
                  justify="center"
                  style={{
                    flexGrow: 1,
                    textAlign: "center",
                    color:
                      colorScheme === "dark"
                        ? theme.colors.gray[4]
                        : theme.colors.gray[6],
                  }}
                >
                  <Sparkles
                    size={64}
                    color={theme.colors.yellow[5]}
                    style={{ marginBottom: theme.spacing.lg }}
                  />
                  <Title
                    order={3}
                    style={{
                      fontSize: "2rem",
                      fontWeight: 700,
                      marginBottom: theme.spacing.md,
                      color:
                        colorScheme === "dark"
                          ? theme.colors.gray[2]
                          : theme.colors.gray[8],
                    }}
                  >
                    Your AI Assistant Awaits
                  </Title>
                  <Text
                    size="md"
                    c={
                      colorScheme === "dark"
                        ? theme.colors.gray[4]
                        : theme.colors.gray[6]
                    }
                    style={{ maxWidth: "300px" }}
                  >
                    Once a video is loaded, this is where you'll interact with
                    our intelligent AI chat.
                  </Text>
                </Stack>
              )}
            </Card>
          </Grid.Col>
        </Grid>

        {/* Footer */}
        <Text
          c={
            colorScheme === "dark" ? theme.colors.gray[6] : theme.colors.gray[7]
          }
          size="sm"
          ta="center"
          mt="xl"
          style={{
            paddingTop: theme.spacing.md,
            borderTop: `1px solid ${
              colorScheme === "dark"
                ? theme.colors.dark[7]
                : theme.colors.gray[3]
            }`,
            animation: "fadeInUp 1s ease-out 0.5s forwards",
            "@keyframes fadeInUp": {
              from: { opacity: 0, transform: "translateY(20px)" },
              to: { opacity: 1, transform: "translateY(0)" },
            },
          }}
        >
          &copy; {new Date().getFullYear()} Talk2YT. All rights reserved. Built
          by{" "}
          <Anchor
            href="https://maheshpandit.com.np"
            target="_blank"
            rel="noopener noreferrer"
            c={theme.colors.indigo[4]}
            fw={600}
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
