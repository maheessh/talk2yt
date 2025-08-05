import React, { useState } from 'react';
import { Card, Title, Text, Divider, Group, Stack, UnstyledButton, Badge } from '@mantine/core';
import { BookOpen, Tag, ChevronDown, ChevronUp } from 'lucide-react';

// Define the component's props
interface VideoInfoDisplayProps {
  title: string;
  description: string;
  summary?: string;
  topics?: string[];
  onTopicClick: (topic: string) => void;
}

// A reusable component for creating consistent sections (e.g., Summary, Topics)
const InfoSection: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <>
    <Divider my="lg" style={(theme) => ({ borderColor: theme.colors.dark[7] })} />
    <Stack gap="md">
      <Group gap="sm" align="center">
        {icon}
        <Title order={4} c="dimmed">{title}</Title>
      </Group>
      <div>{children}</div>
    </Stack>
  </>
);


const VideoInfoDisplay: React.FC<VideoInfoDisplayProps> = ({ title, description, summary, topics, onTopicClick }) => {
  const [isDescriptionExpanded, setDescriptionExpanded] = useState(false);

  return (
    <Card
      shadow="xl"
      radius="lg"
      p="xl"
      withBorder
      style={(theme) => ({
        backgroundColor: theme.colors.dark[9],
        borderColor: theme.colors.dark[7],
        height: '100%', // Make it fill the container height
      })}
    >
      {/* Video Title */}
      <Title order={2} fz="xl" fw={700} c="white" mb="xs">
        {title}
      </Title>

      {/* Video Description with "Show More" functionality */}
      <Stack gap="xs">
        <Text c="dimmed" lineClamp={isDescriptionExpanded ? undefined : 3} style={{ lineHeight: 1.6 }}>
          {description}
        </Text>
        {description.length > 150 && ( // Only show button if description is long enough
          <UnstyledButton onClick={() => setDescriptionExpanded((v) => !v)} style={{ alignSelf: 'flex-start' }}>
            <Group gap="xs" align="center">
              <Text c="indigo.3" fw={500} size="sm">
                {isDescriptionExpanded ? 'Show less' : 'Show more'}
              </Text>
              {isDescriptionExpanded ? <ChevronUp size={16} color="#818CF8" /> : <ChevronDown size={16} color="#818CF8" />}
            </Group>
          </UnstyledButton>
        )}
      </Stack>

      {/* Video Summary Section */}
      {summary && (
        <InfoSection icon={<BookOpen size={20} color="#818CF8" />} title="Video Summary">
          <Text c="gray.4" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
            {summary}
          </Text>
        </InfoSection>
      )}

      {/* Key Topics section, displayed as clickable badges */}
      {topics && topics.length > 0 && (
        <InfoSection icon={<Tag size={20} color="#818CF8" />} title="Key Topics">
          <Group gap="xs">
            {topics.map((topic) => (
              <Badge
                key={topic}
                component="button"
                onClick={() => onTopicClick(topic)}
                variant="light"
                color="indigo"
                size="lg"
              >
                {topic}
              </Badge>
            ))}
          </Group>
        </InfoSection>
      )}
    </Card>
  );
};

export default VideoInfoDisplay;