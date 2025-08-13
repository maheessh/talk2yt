# api/wsgi_app.py
# Flask backend with Gemini, timestamp-citing answers, and Python 3.8/3.9-compatible typing

import os
import logging
import re
from typing import Optional, List, Dict, Any

from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import google.generativeai as genai
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled
import requests

# --- Configuration ---
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logging.error("GEMINI_API_KEY not found in environment variables. Please set it.")

app = Flask(__name__)
CORS(app)  # In production, scope this to your frontend origin.

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logging.getLogger('flask_cors').level = logging.DEBUG

try:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-1.5-flash')
    logging.info("Gemini model 'gemini-1.5-flash' initialized successfully.")
except Exception as e:
    model = None
    logging.error(f"Failed to initialize Gemini model: {e}")

# Constants for transcript chunking
MAX_TRANSCRIPT_LENGTH_CHARS = 12000
OVERLAP_CHARS = 500


# --- Helper Functions ---

def clean_ai_response(text: Any) -> str:
    """Remove unwanted formatting like markdown bolding and trim."""
    if not isinstance(text, str):
        return ""
    text = text.replace('**', '')
    return text.strip()


def extract_youtube_video_id(url: Any) -> Optional[str]:
    """Extract a YouTube video ID from many URL formats, or from a bare 11-char ID."""
    if not isinstance(url, str):
        return None
    s = url.strip()
    # Bare ID
    if re.fullmatch(r'[a-zA-Z0-9_-]{11}', s):
        return s
    try:
        # Normalize to have a scheme so urlparse behaves
        if not re.match(r'^https?://', s, re.IGNORECASE):
            s = 'https://' + s
        from urllib.parse import urlparse, parse_qs
        u = urlparse(s)
        host = (u.hostname or '').lower().replace('www.', '')
        vid = None
        if host in ('youtube.com', 'm.youtube.com', 'music.youtube.com'):
            if u.path == '/watch':
                q = parse_qs(u.query)
                vid = (q.get('v') or [None])[0]
            if not vid and u.path.startswith('/embed/'):
                vid = u.path.split('/embed/')[1].split('/')[0]
            if not vid and u.path.startswith('/v/'):
                vid = u.path.split('/v/')[1].split('/')[0]
            if not vid and u.path.startswith('/shorts/'):
                vid = u.path.split('/shorts/')[1].split('/')[0]
        elif host == 'youtu.be':
            vid = (u.path or '').lstrip('/').split('/')[0]
        if vid and re.fullmatch(r'[a-zA-Z0-9_-]{11}', vid):
            return vid
    except Exception:
        pass

    # Regex fallback
    regexes = [
        r"(?:v=|/videos/|embed\/|youtu\.be\/|\/v\/|\/e\/|watch\?v=|v=)([a-zA-Z0-9_-]{11})",
        r"([a-zA-Z0-9_-]{11})$"
    ]
    for rgx in regexes:
        m = re.search(rgx, url)
        if m:
            return m.group(1)
    return None


def format_timestamp(seconds: float) -> str:
    """Converts seconds to [HH:MM:SS] format."""
    try:
        seconds = float(seconds)
    except Exception:
        seconds = 0.0
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    return f"[{hours:02}:{minutes:02}:{secs:02}]"


def get_video_metadata_from_webpage(video_id: str) -> (str, str):
    """Lightweight scrape of title/description using OG tags."""
    try:
        page_url = f"https://www.youtube.com/watch?v={video_id}"
        logging.info(f"Attempting to scrape metadata from: {page_url}")
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
                          " AppleWebKit/537.36 (KHTML, like Gecko)"
                          " Chrome/114.0 Safari/537.36"
        }
        resp = requests.get(page_url, timeout=10, headers=headers)
        resp.raise_for_status()
        html = resp.text
        title_match = re.search(r'<meta property="og:title" content="([^"]*)"', html)
        desc_match = re.search(r'<meta property="og:description" content="([^"]*)"', html)
        title = title_match.group(1) if title_match else "Unknown Title"
        description = desc_match.group(1) if desc_match else "No Description Available"
        return title, description
    except Exception as e:
        logging.error(f"Error fetching video metadata for {video_id}: {e}")
        return "Error fetching title", "Error fetching description"


def get_transcript_chunks(transcript_text: str, max_chars: int, overlap_chars: int) -> List[str]:
    """Chunk a long transcript to help with summarization."""
    if not transcript_text:
        return []
    chunks: List[str] = []
    pos = 0
    n = len(transcript_text)
    while pos < n:
        end = min(pos + max_chars, n)
        chunks.append(transcript_text[pos:end])
        pos += max_chars - overlap_chars
        if pos >= n:
            break
    logging.info(f"Transcript chunked into {len(chunks)} parts.")
    return chunks


def call_gemini(prompt: str) -> str:
    """Robust wrapper around Gemini call that returns text or empty string."""
    if model is None:
        logging.error("Gemini model is not initialized.")
        return ""
    try:
        resp = model.generate_content(prompt)
        # Try common ways to get text
        if getattr(resp, "text", None):
            return str(resp.text)
        # Fallback (older SDKs)
        cand = getattr(resp, "candidates", None)
        if cand and cand[0].content and cand[0].content.parts:
            return str(cand[0].content.parts[0].text or "")
        return ""
    except Exception as e:
        logging.error(f"Gemini call failed: {e}", exc_info=True)
        return ""


# --- API Endpoints ---

@app.route('/api/extract-video-info', methods=['POST'])
def extract_video_info():
    data = request.get_json(silent=True) or {}
    video_url = data.get('video_url')
    if not video_url:
        return jsonify({"error": "Video URL is required"}), 400

    video_id = extract_youtube_video_id(video_url)
    if not video_id:
        return jsonify({"error": "Invalid YouTube URL"}), 400

    title, description = get_video_metadata_from_webpage(video_id)

    # Get both raw list and flat text
    transcript_text = ""
    transcript_list: List[Dict[str, Any]] = []
    try:
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=['en', 'en-US', 'en-GB'])
        transcript_text = " ".join([entry.get('text', '') for entry in transcript_list])
        logging.info(f"Transcript extracted for {video_id}. Length: {len(transcript_text)} chars. Items: {len(transcript_list)}")
    except NoTranscriptFound:
        return jsonify({"error": "A transcript could not be found for this video."}), 404
    except TranscriptsDisabled:
        return jsonify({"error": "Transcripts are disabled for this video."}), 403
    except Exception as e:
        logging.error(f"Unexpected error getting transcript for {video_id}: {e}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred while fetching the transcript: {str(e)}"}), 500

    return jsonify({
        "videoId": video_id,
        "title": title,
        "description": description,
        "transcript": transcript_text,
        "transcript_list": transcript_list,  # <-- ADDED for precise timestamps
    })


@app.route('/api/chat-with-video', methods=['POST'])
def chat_with_video():
    """
    Unified endpoint:
    - Preferred: 'video_transcript_list' (raw list with timestamps)
    - Fallback:  'video_transcript' (flat string)
    - Optional:  'conversation_history' (list of {role: 'user'|'ai', text: str})
    Forces model to lead with a [HH:MM:SS] timestamp in the answer.
    """
    data = request.get_json(silent=True) or {}

    user_query = data.get('user_query', '')
    video_transcript_list = data.get('video_transcript_list')  # preferred
    video_transcript = data.get('video_transcript')            # fallback
    conversation_history = data.get('conversation_history', [])

    if not user_query:
        return jsonify({"error": "User query is required"}), 400

    if not video_transcript_list and not video_transcript:
        return jsonify({"error": "Either 'video_transcript_list' or 'video_transcript' is required"}), 400

    # Build formatted transcript for the model
    formatted_transcript = ""
    if isinstance(video_transcript_list, list) and video_transcript_list:
        try:
            formatted_transcript = " ".join(
                f"{format_timestamp(item.get('start', 0))} {item.get('text','')}"
                for item in video_transcript_list
            )
        except Exception as e:
            logging.warning(f"Failed to format transcript list, falling back to flat transcript: {e}")
    if not formatted_transcript and isinstance(video_transcript, str):
        formatted_transcript = video_transcript

    # Prepare prior chat
    history_string = ""
    if isinstance(conversation_history, list) and conversation_history:
        pieces = []
        for item in conversation_history[-12:]:  # keep recent
            role = item.get('role', 'user')
            speaker = "You" if role == 'user' else "Sanchar"
            pieces.append(f"{speaker}: {item.get('text','')}")
        history_string = "\n".join(pieces)

    # Prompt to force timestamp-cited answers
    prompt_template = (
        "You are Sanchar, an AI video assistant. Answer the user's question based ONLY on the video content below. "
        "The transcript is formatted with timestamps like [HH:MM:SS].\n\n"
        "REQUIREMENTS:\n"
        "1) Begin your answer with the most relevant timestamp in [HH:MM:SS] format.\n"
        "2) Keep your answer concise and factual.\n"
        "3) If you cannot find an answer in the video, say so.\n\n"
        f"--- PREVIOUS CONVERSATION ---\n{history_string}\n\n"
        f"--- VIDEO CONTENT ---\n{formatted_transcript}\n---\n\n"
        f"User Query: {user_query}\n\n"
        "Sanchar's Answer:"
    )

    logging.info(f"Sending chat query to Gemini (prompt size: {len(prompt_template)} chars)")
    try:
        ai_raw = call_gemini(prompt_template)
        ai_response_text = clean_ai_response(ai_raw) or "I'm sorry, I couldn't find an answer to that in the video content."
        logging.info(f"Gemini response (first 120): {ai_response_text[:120]}...")
        return jsonify({"response": ai_response_text})
    except Exception as e:
        logging.error(f"Unexpected error during chat with video: {e}", exc_info=True)
        return jsonify({"error": "An unexpected error occurred."}), 500


@app.route('/api/summarize-video', methods=['POST'])
def summarize_video():
    """
    Two-step summary for long videos.
    """
    data = request.get_json(silent=True) or {}
    video_transcript = data.get('video_transcript', '')

    if not video_transcript:
        return jsonify({"error": "Video transcript is required"}), 400

    transcript_chunks = get_transcript_chunks(
        video_transcript, MAX_TRANSCRIPT_LENGTH_CHARS, OVERLAP_CHARS
    )
    if not transcript_chunks:
        return jsonify({"summary": "There is no content to summarize."})

    summaries: List[str] = []
    try:
        # Step 1: Summarize each chunk
        for i, chunk in enumerate(transcript_chunks):
            logging.info(f"Summarizing chunk {i+1}/{len(transcript_chunks)}")
            prompt = (
                "Provide a detailed summary of the following video content segment. "
                "Focus on key points, arguments, and conclusions.\n\n"
                f"---\n{chunk}\n---"
            )
            resp = call_gemini(prompt)
            if resp:
                summaries.append(resp)

        # Step 2: Synthesize
        if len(summaries) > 1:
            logging.info("Creating a final meta-summary from all chunk summaries.")
            combined = "\n\n---\n\n".join(summaries)
            final_prompt = (
                "You are Sanchar, a helpful AI video assistant. "
                "You will be given several summaries from different parts of a single video. "
                "Synthesize them into a structured response.\n\n"
                "FORMAT:\n"
                "1) Summary: a concise paragraph of the whole video.\n"
                "2) Key Takeaways: a bulleted list of the most important points.\n\n"
                f"--- Individual Summaries ---\n{combined}\n\n"
                "--- Final Synthesized Response ---"
            )
            final_summary_text = call_gemini(final_prompt)
        else:
            final_summary_text = summaries[0] if summaries else ""

        cleaned = clean_ai_response(final_summary_text)
        if not cleaned:
            cleaned = "I could not generate a summary for this video."

        logging.info(f"Generated final summary (first 150): {cleaned[:150]}...")
        return jsonify({"summary": cleaned})

    except Exception as e:
        logging.error(f"Unexpected error during summarization: {e}", exc_info=True)
        return jsonify({"error": "An unexpected error occurred while generating the summary."}), 500


@app.route('/api/extract-topics', methods=['POST'])
def extract_topics():
    data = request.get_json(silent=True) or {}
    video_transcript = data.get('video_transcript', '')
    if not video_transcript:
        return jsonify({"error": "Video transcript is required"}), 400

    segment = video_transcript[:MAX_TRANSCRIPT_LENGTH_CHARS]
    try:
        prompt = (
            "Analyze the following video content and extract the top 5-7 most important topics. "
            "Return a simple, clean, comma-separated list (e.g., 'Topic 1, Topic 2, Topic 3'). "
            "Do not use numbers or bullet points.\n\n"
            f"---\n{segment}\n---"
        )
        resp = call_gemini(prompt)
        cleaned = clean_ai_response(resp)
        topics_list = [t.strip() for t in cleaned.split(',') if t.strip()]
        logging.info(f"Extracted topics: {topics_list}")
        return jsonify({"topics": topics_list})
    except Exception as e:
        logging.error(f"Unexpected error during topic extraction: {e}", exc_info=True)
        return jsonify({"error": "An unexpected error occurred while extracting topics."}), 500


# --- Main Entry Point ---
if __name__ == '__main__':
    # Use host='0.0.0.0' to make server accessible on your local network
    app.run(host='0.0.0.0', port=5000, debug=True)
