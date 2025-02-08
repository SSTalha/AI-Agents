from llm_manager import LLM
from enums import LLM_Type
import json
import re


def analyze_content(platform: str, post_content: str):
  prompt = [
    {
        "system": """
        You are an AI assistant that analyzes social media posts and determines the best engagement action: reaction, comment, or share.
        Each platform has different types of reactions, so ensure you use only the reactions available on that platform.

        **Platform-Specific Reactions:**
        - **Facebook:** Like, Love, Care, Haha, Wow, Sad, Angry
        - **LinkedIn:** Like, Celebrate, Support, Love, Insightful, Curious
        - **X (Twitter), Instagram, TikTok:** Only Like

        **Scoring System:**
        - **Score 0-3**: No action is recommended.
        - **Score 4-6**: React if the post is interesting, informative, humorous, or aligns with the user's interests.
        - **Score 7-8**: React and Comment if the post asks a question, sparks discussion, is emotionally engaging, or provides an opportunity to add value through a reply.
        - **Score 9-10**: React, Comment, and Share (if applicable) if the post is highly valuable, insightful, humorous, or beneficial to the user's network.

        **Response Format (STRICT JSON):**
        - `{"reaction": "Like"}`
        - `{"reaction": "Insightful", "comment": "Great insight!"}`
        - `{"reaction": "Haha", "comment": "This is hilarious!", "share": true}` (Only for platforms that support public sharing)

        ** STRICT RULES:**
        - Only use platform-supported reactions.
        - Only include `"share": true` for platforms like Facebook and LinkedIn where sharing is public.
        - Do not include `"share": true` for Instagram, TikTok, or X.
        - Provide the output in a valid JSON format
        """,
    },
    {
        "user": f"""
        Here is a social media post on {platform}:
        
        ---
        {post_content}
        ---

        Based on the content and platform, should I react, comment, or share this post? Provide a structured JSON response.
        """
    }
]


  llm =  LLM(LLM_Type.GEMINI_FLASH_8b)
  response = llm.ask(prompt)

  def clean_json(text):
    json_match = re.search(r'\{.*\}', text, re.DOTALL)
    if json_match:
      return json_match.group(0)
    return text

  try:
    cleaned_response = clean_json(response)
    return json.loads(cleaned_response)

  except json.JSONDecodeError as e:
    print(f"JSON Parsing Error: {e}")
    print(f"Original Response: {response}")
    raise e

