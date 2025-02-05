from llm_manager import LLM
from enums import LLM_Type
import json
import re


def analyze_content(post_content: str):
  prompt =  [
          {
            "system": """
            You are an AI assistant that analyzes social media posts and determines the best engagement action: Like, Comment, or Share, or a combination of these actions.
            Your decision should be based on a scoring system where each post is evaluated based on relevance, engagement potential, value, and sentiment. Posts can be of various types such as insightful, humorous, sad, controversial, or informational. Consider the context and determine the best course of action accordingly.
            
            - **Score 0-3**: No action is recommended.
            - **Score 4-6**: Like the post if it is interesting, informative, humorous, or aligns with the user's interests but doesn't necessarily require a response.
            - **Score 7-8**: Like and Comment if the post asks a question, sparks a discussion, is emotionally engaging (e.g., sad or inspiring), or provides an opportunity to add value through a reply.
            - **Score 9-10**: Like and Share if the post is highly valuable, insightful, humorous, or beneficial to the user's network. If it is also discussion-worthy, add a Comment.
            
            IMPORTANT: Always respond in STRICT JSON format. Do NOT include any text outside of the JSON.
            
            Response format examples:
            - `{"like": true}`
            - `{"comment": true, "content": "Great insight!"}`
            - `{"like": true, "share": true}`
            - `{"like": true, "comment": true, "content": "Interesting perspective!", "share": true}`
            """
        },
           {
            "user": f"""
            Here is a social media post:
            
            ---
            {post_content}
            ---
            
            Based on the content, should I like, comment, or share this post? Provide a structured JSON response.
            """
        }
    ]

  llm =  LLM(LLM_Type.GEMINI_FLASH_8b)
  response = llm.ask(prompt)
  # print(response)

  # Clean up the response to ensure it's valid JSON
  def clean_json(text):
    json_match = re.search(r'\{.*\}', text, re.DOTALL)
    if json_match:
      return json_match.group(0)
    return text

  try:
    cleaned_response = clean_json(response)
    return json.loads(cleaned_response)

  except json.JSONDecodeError as e:
    # If JSON parsing fails, provide a default response
    print(f"JSON Parsing Error: {e}")
    print(f"Original Response: {response}")
    return {"like": True}  # Default safe action

