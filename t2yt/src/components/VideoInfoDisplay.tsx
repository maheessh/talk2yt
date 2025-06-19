// src/components/VideoInfoDisplay.tstyle
import React from 'react';
import { Card, Title, Text, Divider, Group, Badge, Stack } from '@mantine/core';
import { BookOpen, Tag } from 'lucide-react';

interface VideoInfoDisplayProps {
  title: string;
  description: string;
  summary?: string;
  topics?: string[];
  onTopicClick: (topic: string) => void;
}

const VideoInfoDisplay: React.FC<VideoInfoDisplayProps> = ({ title, description, summary, topics, onTopicClick }) => {
  return (
    <Card shadow="xl" radius="md" p="lg" withBorder
      style={(theme) => ({
        backgroundColor: theme.colors.dark[8],
        borderColor: theme.colors.gray[7],
      })}
    >
      <Title order={2} style={{ fontSize: '1.875rem', fontWeight: 700, color: '#6366F1', lineHeight: 1.3, marginBottom: '0.75rem' }}>
        {title}
      </Title>
      <Text color="dimmed" lineClamp={3} style={{ marginBottom: '1rem' }}>
        {description}
      </Text>

      {summary && (
        <>
          <Divider my="md" />
          <Stack justify="xs">
            <Group justify="xs" style={{ alignItems: 'center' }}>
              <BookOpen size={24} color="#818CF8" />
              <Title order={3} style={{ fontSize: '1.5rem', fontWeight: 600, color: '#A78BFA' }}>Video Summary</Title>
            </Group>
            <Text size="sm" color="dimmed">
              {summary}
            </Text>
          </Stack>
        </>
      )}

      {topics && topics.length > 0 && (
        <>
          <Divider my="md" />
          <Stack justify="xs">
            <Group justify="xs" style={{ alignItems: 'center' }}>
              <Tag size={24} color="#818CF8" />
              <Title order={3} style={{ fontSize: '1.5rem', fontWeight: 600, color: '#A78BFA' }}>Key Topics</Title>
            </Group>
            <Group justify="xs">
              {topics.map((topic, index) => (
                <Badge
                  key={index}
                  size="lg"
                  radius="xl"
                  color="indigo"
                  variant="filled"
                  onClick={() => onTopicClick(topic)}
                  style={(theme) => ({
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      transform: 'scale(1.05)',
                      backgroundColor: theme.colors.indigo[7],
                    },
                    '&:active': {
                      transform: 'scale(0.95)',
                    },
                  })}
                >
                  {topic}
                </Badge>
              ))}
            </Group>
          </Stack>
        </>
      )}
    </Card>
  );
};

export default VideoInfoDisplay;
