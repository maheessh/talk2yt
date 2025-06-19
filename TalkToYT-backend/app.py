# app.py (Professional & Scalable Python Flask Backend)

import os
import json # <--- THIS IMPORT WAS LIKELY MISSING AND CAUSING 500 ERRORS
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import google.generativeai as genai
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled
import re
import requests # Used for fetching video title/description via web scraping if YouTube Data API is not used
from urllib.parse import urlparse, parse_qs

# --- Configuration ---
load_dotenv() # Load environment variables from .env file

# Ensure GEMINI_API_KEY is set. Crucial for production.
# In production, you would set this directly in your hosting environment's variables.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logging.error("GEMINI_API_KEY not found in environment variables. Please set it.")
    # In a real production app, you might want to exit or raise an error here.
    # For a development server, we'll let it proceed but log the error.
    # For now, it's critical for local testing to have it.

# Initialize Flask app
app = Flask(__name__)
# Enable CORS for all origins, allowing frontend to connect.
# In a production environment, you might restrict this to specific origins for security.
CORS(app)

# Configure logging: log messages to console for debugging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logging.getLogger('flask_cors').level = logging.DEBUG # Log CORS specific issues

# Configure the Gemini API with your API key
genai.configure(api_key=GEMINI_API_KEY)

# Initialize the Gemini model. Using 'gemini-2.0-flash' for speed and cost-effectiveness.
# Consider 'gemini-2.0-pro' for more complex reasoning if needed, but flash is good for chat.
try:
    model = genai.GenerativeModel('gemini-2.0-flash')
    logging.info("Gemini model 'gemini-2.0-flash' initialized successfully.")
except Exception as e:
    logging.error(f"Failed to initialize Gemini model: {e}")
    # In production, you might want to exit the app if the model cannot be initialized.

# Constants for transcript chunking for LLM input
# These are approximate. For true token limits, you'd use a tokenizer.
MAX_TRANSCRIPT_LENGTH_CHARS = 10000 # Max characters per chunk for processing (approx. 2000-3000 tokens)
OVERLAP_CHARS = 500 # Overlap between chunks to maintain context

# --- Helper Functions ---

def extract_youtube_video_id(url):
    """
    Extracts the YouTube video ID from a given URL.
    Supports various formats: watch, embed, short links (youtu.be).
    """
    if not isinstance(url, str):
        return None
    regexes = [
        r"(?:v=|/videos/|embed\/|youtu.be\/|\/v\/|\/e\/|watch\?v=|v=)([a-zA-Z0-9_-]{11})",
        r"([a-zA-Z0-9_-]{11})$" # for bare IDs
    ]
    for regex in regexes:
        match = re.search(regex, url)
        if match:
            return match.group(1)
    return None

def get_video_metadata_from_webpage(video_id):
    """
    Attempts to scrape video title and description from YouTube video page.
    This is a fallback. For higher reliability, use the YouTube Data API.
    """
    try:
        page_url = f"https://www.youtube.com/watch?v={video_id}"
        logging.info(f"Attempting to scrape metadata from: {page_url}")
        response = requests.get(page_url, timeout=10)
        response.raise_for_status() # Raise an HTTPError for bad responses (4xx or 5xx)
        html_content = response.text

        # Using regex to find meta tags for title and description
        title_match = re.search(r'<meta property="og:title" content="([^"]*)"', html_content)
        description_match = re.search(r'<meta property="og:description" content="([^"]*)"', html_content)

        title = title_match.group(1) if title_match else "Unknown Title (Scraped)"
        description = description_match.group(1) if description_match else "No Description Available (Scraped)"

        # Basic sanitization
        title = title.replace('&amp;', '&').replace('&#39;', "'")
        description = description.replace('&amp;', '&').replace('&#39;', "'")

        logging.info(f"Scraped Title: {title}, Description: {description[:50]}...")
        return title, description
    except requests.exceptions.RequestException as e:
        logging.error(f"Error fetching video metadata from webpage {video_id}: {e}")
        return "Error fetching title", "Error fetching description"
    except Exception as e:
        logging.error(f"Unexpected error during metadata scraping for {video_id}: {e}")
        return "Error fetching title", "Error fetching description"

def get_transcript_chunks(transcript_text: str, max_chars: int, overlap_chars: int) -> list[str]:
    """
    Breaks a long transcript into chunks suitable for LLM input, with overlap.
    A more robust solution would use a proper tokenizer to count tokens, not characters.
    """
    if not transcript_text:
        return []

    chunks = []
    current_pos = 0
    while current_pos < len(transcript_text):
        end_pos = min(current_pos + max_chars, len(transcript_text))
        chunk = transcript_text[current_pos:end_pos]
        chunks.append(chunk)
        current_pos += max_chars - overlap_chars
        if current_pos >= len(transcript_text): # Handle last chunk not needing overlap advance
            break
    logging.info(f"Transcript chunked into {len(chunks)} parts.")
    return chunks

# --- API Endpoints ---

@app.route('/api/extract-video-info', methods=['POST'])
def extract_video_info():
    """
    Endpoint to extract YouTube video ID, title, description, and transcript.
    Handles various errors from YouTubeTranscriptApi.
    """
    data = request.get_json()
    video_url = data.get('video_url')

    if not video_url:
        logging.warning("Received request without video_url.")
        return jsonify({"error": "Video URL is required"}), 400

    video_id = extract_youtube_video_id(video_url)
    if not video_id:
        logging.warning(f"Invalid YouTube URL provided: {video_url}")
        return jsonify({"error": "Invalid YouTube URL"}), 400

    logging.info(f"Attempting to extract info for video ID: {video_id}")
    title, description = get_video_metadata_from_webpage(video_id)

    transcript_text = ""
    try:
        # Prioritize English, fall back to auto-generated if needed
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=['en', 'en-US', 'en-GB'])
        transcript_text = " ".join([entry['text'] for entry in transcript_list])
        logging.info(f"Transcript successfully extracted for {video_id}. Length: {len(transcript_text)} characters.")
    except NoTranscriptFound:
        logging.warning(f"No transcript found for video ID: {video_id}")
        return jsonify({"error": "No transcript found for this video. Please try another video."}), 404
    except TranscriptsDisabled:
        logging.warning(f"Transcripts disabled for video ID: {video_id}")
        return jsonify({"error": "Transcripts are disabled for this video. Cannot process."}), 403
    except Exception as e:
        logging.error(f"Unexpected error getting transcript for {video_id}: {e}", exc_info=True) # exc_info for full traceback
        return jsonify({"error": f"Failed to get transcript: An unexpected error occurred. {str(e)}"}), 500

    return jsonify({
        "videoId": video_id,
        "title": title,
        "description": description,
        "transcript": transcript_text
    })

@app.route('/api/chat-with-video', methods=['POST'])
def chat_with_video():
    """
    Endpoint to chat with the video using its transcript and Gemini API.
    Handles long transcripts by chunking.
    """
    data = request.get_json()
    user_query = data.get('user_query')
    video_transcript = data.get('video_transcript')

    if not user_query or not video_transcript:
        logging.warning("Chat request missing user_query or video_transcript.")
        return jsonify({"error": "User query and video transcript are required"}), 400

    logging.info(f"Received chat query: '{user_query}' for transcript length {len(video_transcript)}")

    # Chunk the transcript for LLM input
    transcript_chunks = get_transcript_chunks(
        video_transcript,
        MAX_TRANSCRIPT_LENGTH_CHARS,
        OVERLAP_CHARS
    )

    # If transcript is very short, no need for chunking
    if not transcript_chunks:
        transcript_chunks = [video_transcript]

    # Craft a detailed prompt for Gemini.
    # Emphasize the format for timestamps and handling of missing info.
    prompt_template = (
        f"You are an AI assistant specialized in analyzing YouTube video transcripts. "
        f"A user is asking a question about a video. "
        f"Here is a relevant segment (or the entire) transcript of the video:\n\n---\n{{transcript_segment}}\n---\n\n"
        f"Based ONLY on the provided transcript segment, answer the following question from the user:\n"
        f"User Query: {user_query}\n\n"
        f"IMPORTANT: If the answer is directly related to a specific point or event in the video and you can identify "
        f"an approximate timestamp from the context, include the timestamp in your answer. "
        f"Format the timestamp as [HH:MM:SS]. "
        f"For example: 'The speaker mentions X at [00:01:15].' "
        f"If the information is NOT present in the provided transcript segment, "
        f"state clearly that 'The information is not available in the video's transcript.' "
        f"Do not make up information."
    )

    ai_response_text = "The information is not available in the video's transcript." # Default fallback
    try:
        # Iterate through chunks to find relevant information.
        # For a truly 'best' system, you'd use embedding search to find the most relevant chunk.
        # For now, we'll try to get a response from any chunk.
        response_found = False
        for i, chunk in enumerate(transcript_chunks):
            logging.info(f"Sending chat query to Gemini with transcript chunk {i+1}/{len(transcript_chunks)}")
            current_prompt = prompt_template.format(transcript_segment=chunk)
            response = model.generate_content(current_prompt)
            # Check if content exists and is not blocked
            if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                part_text = response.candidates[0].content.parts[0].text
                # Basic check to see if Gemini gave a substantial answer, not just default fallback
                if part_text and "not available" not in part_text.lower() and "cannot process" not in part_text.lower():
                    ai_response_text = part_text
                    response_found = True
                    break # Stop if we get a good answer
                else:
                    logging.info(f"Gemini returned fallback/empty response for chunk {i+1}. Trying next chunk.")
            else:
                logging.warning(f"Gemini response for chunk {i+1} was empty or blocked.")
                if response.prompt_feedback and response.prompt_feedback.block_reason:
                    logging.warning(f"Gemini blocked response: {response.prompt_feedback.block_reason}")


        logging.info(f"Gemini API chat response received: {ai_response_text[:100]}...")
        return jsonify({"response": ai_response_text})

    except genai.APIError as e:
        logging.error(f"Gemini API error during chat: {e}", exc_info=True)
        return jsonify({"error": f"Gemini API error: {str(e)}. Please check your API key and quota."}), 500
    except Exception as e:
        logging.error(f"Unexpected error during chat with video: {e}", exc_info=True)
        return jsonify({"error": f"Failed to get AI response: An unexpected error occurred. {str(e)}"}), 500

@app.route('/api/summarize-video', methods=['POST'])
def summarize_video():
    """
    Endpoint to generate a summary of the video transcript using Gemini API.
    Handles long transcripts by chunking and combining summaries.
    """
    data = request.get_json()
    video_transcript = data.get('video_transcript')

    if not video_transcript:
        logging.warning("Summarize request missing video_transcript.")
        return jsonify({"error": "Video transcript is required"}), 400

    logging.info(f"Received summarize request for transcript length {len(video_transcript)}")

    transcript_chunks = get_transcript_chunks(
        video_transcript,
        MAX_TRANSCRIPT_LENGTH_CHARS,
        OVERLAP_CHARS
    )

    if not transcript_chunks:
        return jsonify({"summary": "No content to summarize."})

    summaries = []
    try:
        for i, chunk in enumerate(transcript_chunks):
            logging.info(f"Sending summary request to Gemini for chunk {i+1}/{len(transcript_chunks)}")
            prompt = (
                f"Please provide a concise summary of the following video transcript chunk. "
                f"Focus on key points and takeaways.\n\n---\n{chunk}\n---"
            )
            response = model.generate_content(prompt)
            if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                summary_chunk_text = response.candidates[0].content.parts[0].text
                summaries.append(summary_chunk_text)
            else:
                logging.warning(f"Gemini returned empty/blocked response for summary chunk {i+1}.")
                if response.prompt_feedback and response.prompt_feedback.block_reason:
                    logging.warning(f"Gemini blocked response: {response.prompt_feedback.block_reason}")


        # Combine summaries. For very long videos, you might summarize the summaries.
        final_summary = " ".join(summaries).strip()
        if not final_summary:
            final_summary = "Could not generate a comprehensive summary based on the provided transcript."

        logging.info(f"Generated summary: {final_summary[:100]}...")
        return jsonify({"summary": final_summary})

    except genai.APIError as e:
        logging.error(f"Gemini API error during summarization: {e}", exc_info=True)
        return jsonify({"error": f"Gemini API error during summarization: {str(e)}. Check key and quota."}), 500
    except Exception as e:
        logging.error(f"Unexpected error during summarization: {e}", exc_info=True)
        return jsonify({"error": f"Failed to generate summary: An unexpected error occurred. {str(e)}"}), 500

@app.route('/api/extract-topics', methods=['POST'])
def extract_topics():
    """
    Endpoint to extract key topics or keywords from the video transcript using Gemini API.
    """
    data = request.get_json()
    video_transcript = data.get('video_transcript')

    if not video_transcript:
        logging.warning("Extract topics request missing video_transcript.")
        return jsonify({"error": "Video transcript is required"}), 400

    logging.info(f"Received extract topics request for transcript length {len(video_transcript)}")

    # Use the full transcript for topics, or first chunk if too long
    # For a high-quality topic extraction on very long videos, you might summarize first, then extract topics from summary.
    transcript_segment = video_transcript
    if len(transcript_segment) > MAX_TRANSCRIPT_LENGTH_CHARS:
        transcript_segment = transcript_segment[:MAX_TRANSCRIPT_LENGTH_CHARS] # Take only beginning for topics

    try:
        prompt = (
            f"Analyze the following video transcript segment and extract the top 5-10 most important key topics or keywords. "
            f"Present them as a comma-separated list of short phrases or single words, for example: 'Topic 1, Keyword 2, Topic 3'. "
            f"Do not include numbering or bullet points. Just the comma-separated list.\n\n---\n{transcript_segment}\n---"
        )
        response = model.generate_content(prompt)
        topics_raw = ""
        if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
            topics_raw = response.candidates[0].content.parts[0].text
        else:
            logging.warning("Gemini returned empty/blocked response for topics extraction.")
            if response.prompt_feedback and response.prompt_feedback.block_reason:
                logging.warning(f"Gemini blocked response: {response.prompt_feedback.block_reason}")

        topics_list = []
        if topics_raw:
            # Clean up the response: remove potential markdown list formatting, split by commas
            cleaned_topics = re.sub(r'^\s*[-*]\s*|\d+\.\s*', '', topics_raw, flags=re.MULTILINE) # Remove list markers
            topics_list = [t.strip() for t in cleaned_topics.split(',') if t.strip()]

        logging.info(f"Extracted topics: {topics_list}")
        return jsonify({"topics": topics_list})

    except genai.APIError as e:
        logging.error(f"Gemini API error during topic extraction: {e}", exc_info=True)
        return jsonify({"error": f"Gemini API error during topic extraction: {str(e)}. Check key and quota."}), 500
    except Exception as e:
        logging.error(f"Unexpected error during topic extraction: {e}", exc_info=True)
        return jsonify({"error": f"Failed to extract topics: An unexpected error occurred. {str(e)}"}), 500

# --- Main entry point for running the Flask app ---
if __name__ == '__main__':
    # For local development:
    # Use host='0.0.0.0' to make it accessible from other devices on your local network.
    # debug=True allows for automatic reloading on code changes and provides more detailed error messages.
    app.run(host='0.0.0.0', port=5000, debug=True)

    # For production deployment, you would NOT use app.run().
    # Instead, you would use a production WSGI server like Gunicorn or Waitress.
    # Example for Gunicorn (install with 'pip install gunicorn'):
    # gunicorn -w 4 -b 0.0.0.0:5000 app:app
    # (-w 4 means 4 worker processes)
