# app.py (Version 2 - With Sanchar Persona, Response Cleaning, and Conversational Memory)

import os
import json
import logging
import re
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import google.generativeai as genai
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled
import requests
from urllib.parse import urlparse, parse_qs

# --- Configuration ---
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logging.error("GEMINI_API_KEY not found in environment variables. Please set it.")
    # For now, it's critical for local testing to have it.

app = Flask(__name__)
CORS(app) # In production, restrict this to your frontend's domain for security.

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logging.getLogger('flask_cors').level = logging.DEBUG

try:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-1.5-flash') # Using 1.5-flash for better long-context understanding
    logging.info("Gemini model 'gemini-1.5-flash' initialized successfully.")
except Exception as e:
    logging.error(f"Failed to initialize Gemini model: {e}")

# Constants for transcript chunking
MAX_TRANSCRIPT_LENGTH_CHARS = 12000 # Increased for gemini-1.5-flash's larger context window
OVERLAP_CHARS = 500

# --- Helper Functions ---

def clean_ai_response(text: str) -> str:
    """
    NEW: Removes unwanted formatting like markdown bolding (**) from the AI's text.
    """
    if not isinstance(text, str):
        return ""
    # Remove markdown asterisks for bolding
    text = text.replace('**', '')
    return text.strip()


def extract_youtube_video_id(url):
    if not isinstance(url, str):
        return None
    regexes = [
        r"(?:v=|/videos/|embed\/|youtu.be\/|\/v\/|\/e\/|watch\?v=|v=)([a-zA-Z0-9_-]{11})",
        r"([a-zA-Z0-9_-]{11})$"
    ]
    for regex in regexes:
        match = re.search(regex, url)
        if match:
            return match.group(1)
    return None

def get_video_metadata_from_webpage(video_id):
    try:
        page_url = f"https://www.youtube.com/watch?v={video_id}"
        logging.info(f"Attempting to scrape metadata from: {page_url}")
        response = requests.get(page_url, timeout=10)
        response.raise_for_status()
        html_content = response.text
        title_match = re.search(r'<meta property="og:title" content="([^"]*)"', html_content)
        description_match = re.search(r'<meta property="og:description" content="([^"]*)"', html_content)
        title = title_match.group(1) if title_match else "Unknown Title"
        description = description_match.group(1) if description_match else "No Description Available"
        return title, description
    except requests.exceptions.RequestException as e:
        logging.error(f"Error fetching video metadata from webpage {video_id}: {e}")
        return "Error fetching title", "Error fetching description"

def get_transcript_chunks(transcript_text: str, max_chars: int, overlap_chars: int) -> list[str]:
    if not transcript_text:
        return []
    chunks = []
    current_pos = 0
    while current_pos < len(transcript_text):
        end_pos = min(current_pos + max_chars, len(transcript_text))
        chunk = transcript_text[current_pos:end_pos]
        chunks.append(chunk)
        current_pos += max_chars - overlap_chars
        if current_pos >= len(transcript_text):
            break
    logging.info(f"Transcript chunked into {len(chunks)} parts.")
    return chunks

# --- API Endpoints ---

@app.route('/api/extract-video-info', methods=['POST'])
def extract_video_info():
    data = request.get_json()
    video_url = data.get('video_url')
    if not video_url:
        return jsonify({"error": "Video URL is required"}), 400

    video_id = extract_youtube_video_id(video_url)
    if not video_id:
        return jsonify({"error": "Invalid YouTube URL"}), 400

    title, description = get_video_metadata_from_webpage(video_id)
    transcript_text = ""
    try:
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=['en', 'en-US', 'en-GB'])
        transcript_text = " ".join([entry['text'] for entry in transcript_list])
        logging.info(f"Transcript extracted for {video_id}. Length: {len(transcript_text)} chars.")
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
        "transcript": transcript_text
    })

@app.route('/api/chat-with-video', methods=['POST'])
def chat_with_video():
    """
    MODIFIED: Now accepts 'conversation_history' for follow-up questions.
    """
    data = request.get_json()
    user_query = data.get('user_query')
    video_transcript = data.get('video_transcript')
    # NEW: Get conversation history from the request
    conversation_history = data.get('conversation_history', []) # Default to empty list

    if not user_query or not video_transcript:
        return jsonify({"error": "User query and video transcript are required"}), 400

    # Create a string from the conversation history for the prompt
    history_string = ""
    if conversation_history:
        history_items = []
        for item in conversation_history:
            # Assuming history items are dicts with 'role' and 'text'
            role = "You" if item.get('role') == 'user' else "Sanchar"
            history_items.append(f"{role}: {item.get('text', '')}")
        history_string = "\n".join(history_items)

    # UPDATED PROMPT: Persona, conciseness, and history context
    prompt_template = (
        f"You are Sanchar, a helpful AI video assistant. Your purpose is to answer questions about a video based on its content. "
        f"Be concise and focus on providing only the necessary details to answer the user's question directly. "
        f"Do NOT mention that you are analyzing a 'transcript'; refer to it as 'the video's content' or 'in the video'. "
        f"If the user's query is vague, ask a clarifying follow-up question.\n\n"
        f"--- PREVIOUS CONVERSATION ---\n{history_string}\n\n"
        f"--- VIDEO CONTENT ---\n{{transcript_segment}}\n---\n\n"
        f"Based on the video content and the conversation history, answer the latest user query.\n"
        f"User Query: {user_query}\n\n"
        f"Sanchar's Answer:"
    )

    # Using the full transcript with Gemini 1.5 Flash's large context window is often better than chunking for chat.
    # We will only chunk if the transcript is excessively long.
    transcript_segment = video_transcript
    if len(video_transcript) > 100000: # Example threshold
         transcript_segment = video_transcript[:100000]


    ai_response_text = "I'm sorry, I couldn't find an answer to that in the video content."
    try:
        logging.info(f"Sending chat query to Gemini with transcript length {len(transcript_segment)}")
        current_prompt = prompt_template.format(transcript_segment=transcript_segment)
        response = model.generate_content(current_prompt)

        if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
            part_text = response.candidates[0].content.parts[0].text
            ai_response_text = clean_ai_response(part_text) # NEW: Clean the response
        else:
            logging.warning("Gemini response was empty or blocked.")

        logging.info(f"Gemini API chat response received: {ai_response_text[:100]}...")
        return jsonify({"response": ai_response_text})

    except Exception as e:
        logging.error(f"Unexpected error during chat with video: {e}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred while getting the AI response."}), 500


@app.route('/api/summarize-video', methods=['POST'])
def summarize_video():
    """
    MODIFIED: Implements a two-step summary process for higher quality results on long videos.
    """
    data = request.get_json()
    video_transcript = data.get('video_transcript')

    if not video_transcript:
        return jsonify({"error": "Video transcript is required"}), 400

    transcript_chunks = get_transcript_chunks(
        video_transcript,
        MAX_TRANSCRIPT_LENGTH_CHARS,
        OVERLAP_CHARS
    )
    if not transcript_chunks:
        return jsonify({"summary": "There is no content to summarize."})

    summaries = []
    try:
        # Step 1: Summarize each chunk individually
        for i, chunk in enumerate(transcript_chunks):
            logging.info(f"Summarizing chunk {i+1}/{len(transcript_chunks)}")
            prompt = (
                "Provide a detailed summary of the following video content segment. "
                "Focus on the key points, arguments, and conclusions presented.\n\n"
                f"---\n{chunk}\n---"
            )
            response = model.generate_content(prompt)
            if response.text:
                summaries.append(response.text)

        # Step 2: If there are multiple summaries, create a final "summary of summaries"
        final_summary_text = ""
        if len(summaries) > 1:
            logging.info("Creating a final meta-summary from all chunk summaries.")
            combined_summaries = "\n\n---\n\n".join(summaries)
            # UPDATED PROMPT: Persona and clear formatting instructions
            final_prompt = (
                 "You are Sanchar, a helpful AI video assistant. "
                 "You will be given several summaries from different parts of a single video. "
                 "Your task is to synthesize them into one final, coherent response. "
                 "The response must be well-structured, easy to read, and must not mention that it's from a transcript.\n\n"
                 "Format the output with two distinct sections:\n"
                 "1. A 'Summary' section: A concise, flowing paragraph that captures the main ideas of the entire video.\n"
                 "2. A 'Key Takeaways' section: A bulleted list of the most important points or actionable items mentioned.\n\n"
                 "--- Individual Summaries ---\n"
                 f"{combined_summaries}\n\n"
                 "--- Final Synthesized Response ---"
            )

            final_response = model.generate_content(final_prompt)
            final_summary_text = final_response.text
        else:
            # If only one chunk, just use its summary
            final_summary_text = summaries[0] if summaries else ""

        # NEW: Clean the final response before sending it
        cleaned_summary = clean_ai_response(final_summary_text)

        if not cleaned_summary:
            cleaned_summary = "I could not generate a summary for this video."

        logging.info(f"Generated final summary: {cleaned_summary[:150]}...")
        return jsonify({"summary": cleaned_summary})

    except Exception as e:
        logging.error(f"Unexpected error during summarization: {e}", exc_info=True)
        return jsonify({"error": "An unexpected error occurred while generating the summary."}), 500


# This endpoint is less critical for the chat UI but is updated for consistency.
@app.route('/api/extract-topics', methods=['POST'])
def extract_topics():
    data = request.get_json()
    video_transcript = data.get('video_transcript')
    if not video_transcript:
        return jsonify({"error": "Video transcript is required"}), 400

    transcript_segment = video_transcript[:MAX_TRANSCRIPT_LENGTH_CHARS]
    try:
        prompt = (
            "Analyze the following video content and extract the top 5-7 most important topics. "
            "Present them as a simple, clean, comma-separated list (e.g., 'Topic 1, Topic 2, Topic 3'). "
            "Do not use numbers or bullet points.\n\n"
            f"---\n{transcript_segment}\n---"
        )
        response = model.generate_content(prompt)
        topics_raw = response.text if response.text else ""
        
        # Clean and parse the topics list
        cleaned_topics = clean_ai_response(topics_raw)
        topics_list = [t.strip() for t in cleaned_topics.split(',') if t.strip()]

        logging.info(f"Extracted topics: {topics_list}")
        return jsonify({"topics": topics_list})

    except Exception as e:
        logging.error(f"Unexpected error during topic extraction: {e}", exc_info=True)
        return jsonify({"error": "An unexpected error occurred while extracting topics."}), 500

# --- Main Entry Point ---
if __name__ == '__main__':
    # Use host='0.0.0.0' to make server accessible on your local network
    app.run(host='0.0.0.0', port=5000, debug=True)