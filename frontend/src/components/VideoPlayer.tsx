// src/components/VideoPlayer.tsx
import React from 'react';

// Define the props interface for type safety.
// videoId: The unique identifier for the YouTube video (e.g., "dQw4w9WgXcQ").
interface VideoPlayerProps {
  videoId: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoId }) => {
  // Construct the YouTube embed URL using the provided videoId.
  // The 'enablejsapi=1' parameter is useful if you plan to use the YouTube Iframe Player API
  // for features like seeking to specific timestamps (as discussed in unique features).
  const youtubeEmbedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;

  return (
    // Container div for the iframe to ensure a responsive aspect ratio (16:9).
    // 'relative', 'w-full', 'aspect-video' are Tailwind classes for this purpose.
    // 'rounded-lg', 'overflow-hidden', 'shadow-lg', 'border' provide aesthetic styling.
    <div className="relative w-full aspect-video rounded-lg overflow-hidden shadow-lg border border-gray-700">
      {/* The iframe element to embed the YouTube video. */}
      <iframe
        // 'absolute top-0 left-0 w-full h-full' ensures the iframe fills its parent container.
        className="absolute top-0 left-0 w-full h-full"
        src={youtubeEmbedUrl} // Set the source URL of the video.
        frameBorder="0" // Remove default iframe border.
        // 'allow' attribute grants permissions for various features like autoplay, full screen.
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen // Allows the video to go full screen.
        title="YouTube video player" // Accessible title for the iframe.
      ></iframe>
    </div>
  );
};

export default VideoPlayer;
