// src/components/VideoInfoDisplay.tsx
import React, { useMemo, useState } from 'react';
import {
  Card, Title, Text, Divider, Group, Stack, UnstyledButton, Badge,
  ActionIcon, Tooltip, TextInput, Kbd
} from '@mantine/core';
import {
  BookOpen, Tag, ChevronDown, ChevronUp, Copy, Check, Search
} from 'lucide-react';

// Define the component's props (kept)
interface VideoInfoDisplayProps {
  title: string;
  description: string;
  summary?: string;
  topics?: string[];
  onTopicClick: (topic: string) => void;
}

// Reusable section wrapper (kept, polished)
const InfoSection: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <>
    <Divider my="lg" />
    <Stack gap="md">
      <Group gap="sm" align="center">
        {icon}
        <Title order={4} c="dimmed">{title}</Title>
      </Group>
      <div>{children}</div>
    </Stack>
  </>
);

const VideoInfoDisplay: React.FC<VideoInfoDisplayProps> = ({
  title, description, summary, topics, onTopicClick
}) => {
  const [isDescriptionExpanded, setDescriptionExpanded] = useState(false);
  // === ADDED: Summary expand/collapse
  const [isSummaryExpanded, setSummaryExpanded] = useState(false);

  // === ADDED: Copy feedback states
  const [copied, setCopied] = useState<{ field: 'title' | 'description' | 'summary' | null }>({ field: null });

  // === ADDED: topic search & pagination
  const [topicQuery, setTopicQuery] = useState('');
  const [showAllTopics, setShowAllTopics] = useState(false);
  const TOPIC_PREVIEW_COUNT = 10;

  const normalizedTopics = useMemo(() => {
    if (!topics || topics.length === 0) return [];
    // stable sort & dedupe
    const set = new Set(topics.map((t) => t.trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [topics]);

  const filteredTopics = useMemo(() => {
    const q = topicQuery.trim().toLowerCase();
    if (!q) return normalizedTopics;
    return normalizedTopics.filter((t) => t.toLowerCase().includes(q));
  }, [normalizedTopics, topicQuery]);

  const visibleTopics = useMemo(() => {
    if (showAllTopics) return filteredTopics;
    return filteredTopics.slice(0, TOPIC_PREVIEW_COUNT);
  }, [filteredTopics, showAllTopics]);

  const hasMore = filteredTopics.length > TOPIC_PREVIEW_COUNT;

  // === ADDED: utility to copy text with tiny success feedback
  const handleCopy = async (field: 'title' | 'description' | 'summary', value: string | undefined) => {
    if (!value) return;
    try {
      await navigator.clipboard?.writeText(value);
      setCopied({ field });
      setTimeout(() => setCopied({ field: null }), 1200);
    } catch {
      // swallow – clipboard API may be blocked
    }
  };

  return (
    <Card
      shadow="xl"
      radius="lg"
      p="xl"
      withBorder
      style={(theme: any) => ({
        backgroundColor: theme.colors.dark[9],
        borderColor: theme.colors.dark[7],
        height: '100%',
      })}
    >
      {/* Title row with copy (kept + added copy) */}
      <Group justify="space-between" align="flex-start" mb="xs">
        <Title order={2} fz="xl" fw={800} c="white" style={{ lineHeight: 1.2 }}>
          {title}
        </Title>
        <Tooltip label={copied.field === 'title' ? 'Copied!' : 'Copy title'}>
          <ActionIcon
            variant="subtle"
            aria-label="Copy title"
            onClick={() => handleCopy('title', title)}
          >
            {copied.field === 'title' ? <Check size={18} /> : <Copy size={18} />}
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* Description with show more + copy (kept + added copy) */}
      <Stack gap="xs">
        <Text c="dimmed" lineClamp={isDescriptionExpanded ? undefined : 3} style={{ lineHeight: 1.6 }}>
          {description}
        </Text>

        <Group gap="sm">
          {description && description.length > 150 && (
            <UnstyledButton onClick={() => setDescriptionExpanded((v) => !v)} style={{ alignSelf: 'flex-start' }}>
              <Group gap="xs" align="center">
                <Text c="indigo.3" fw={600} size="sm">
                  {isDescriptionExpanded ? 'Show less' : 'Show more'}
                </Text>
                {isDescriptionExpanded ? <ChevronUp size={16} color="#818CF8" /> : <ChevronDown size={16} color="#818CF8" />}
              </Group>
            </UnstyledButton>
          )}

          <Tooltip label={copied.field === 'description' ? 'Copied!' : 'Copy description'}>
            <ActionIcon
              variant="subtle"
              aria-label="Copy description"
              onClick={() => handleCopy('description', description)}
            >
              {copied.field === 'description' ? <Check size={18} /> : <Copy size={18} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </Stack>

      {/* Summary (kept, now collapsible + copy) */}
      {summary && (
        <InfoSection icon={<BookOpen size={20} color="#818CF8" />} title="Video Summary">
          <Stack gap="xs">
            <Text
              c="gray.4"
              style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}
              lineClamp={isSummaryExpanded ? undefined : 6}
            >
              {summary}
            </Text>
            <Group gap="sm">
              {summary.length > 400 && (
                <UnstyledButton onClick={() => setSummaryExpanded((v) => !v)} style={{ alignSelf: 'flex-start' }}>
                  <Group gap="xs" align="center">
                    <Text c="indigo.3" fw={600} size="sm">
                      {isSummaryExpanded ? 'Show less' : 'Show more'}
                    </Text>
                    {isSummaryExpanded ? <ChevronUp size={16} color="#818CF8" /> : <ChevronDown size={16} color="#818CF8" />}
                  </Group>
                </UnstyledButton>
              )}
              <Tooltip label={copied.field === 'summary' ? 'Copied!' : 'Copy summary'}>
                <ActionIcon
                  variant="subtle"
                  aria-label="Copy summary"
                  onClick={() => handleCopy('summary', summary)}
                >
                  {copied.field === 'summary' ? <Check size={18} /> : <Copy size={18} />}
                </ActionIcon>
              </Tooltip>
            </Group>
          </Stack>
        </InfoSection>
      )}

      {/* Topics (kept) with search, pagination, and nicer badges */}
      {normalizedTopics.length > 0 && (
        <InfoSection icon={<Tag size={20} color="#818CF8" />} title="Key Topics">
          {/* === ADDED: search input for topics */}
          <TextInput
            placeholder="Search topics…"
            value={topicQuery}
            onChange={(e) => setTopicQuery(e.currentTarget.value)}
            leftSection={<Search size={16} />}
            variant="filled"
            radius="md"
            mb="sm"
          />

          <Group gap="xs">
            {visibleTopics.map((topic) => (
              <Badge
                key={topic}
                component="button"
                onClick={() => onTopicClick(topic)}
                variant="light"
                color="indigo"
                size="lg"
                radius="sm"
                styles={{ root: { cursor: 'pointer' } }}
                title={`Ask about “${topic}”`}
              >
                {topic}
              </Badge>
            ))}
          </Group>

          {/* === ADDED: show more/less control (only when needed) */}
          {hasMore && (
            <UnstyledButton onClick={() => setShowAllTopics((v) => !v)} style={{ marginTop: 8 }}>
              <Group gap="xs" align="center">
                <Text c="indigo.3" fw={600} size="sm">
                  {showAllTopics ? 'Show fewer topics' : `Show ${filteredTopics.length - TOPIC_PREVIEW_COUNT} more`}
                </Text>
                {showAllTopics ? <ChevronUp size={16} color="#818CF8" /> : <ChevronDown size={16} color="#818CF8" />}
              </Group>
            </UnstyledButton>
          )}

          {/* === ADDED: tiny hint */}
          <Text size="xs" c="dimmed" mt="xs">
            Tip: Click a topic to ask about it, or type to filter. Try <Kbd>Tab</Kbd> then <Kbd>Enter</Kbd> to move quickly.
          </Text>
        </InfoSection>
      )}
    </Card>
  );
};

export default VideoInfoDisplay;
