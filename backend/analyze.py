from llm_manager import LLM
from enums import LLM_Type
import json

def analyze(post_content: str):
  prompt =  [
          {
            "system": """
            You are an AI assistant that analyzes social media posts and determines the best engagement action: Like, Comment, or Share, or a combination of these actions.
            Your decision should be based on a scoring system where each post is evaluated based on relevance, engagement potential, value, and sentiment. Posts can be of various types such as insightful, humorous, sad, controversial, or informational. Consider the context and determine the best course of action accordingly.
            
            - **Score 0-3**: No action is recommended.
            - **Score 4-6**: Like the post if it is interesting, informative, humorous, or aligns with the user's interests but doesn't necessarily require a response.
            - **Score 7-8**: Like and Comment if the post asks a question, sparks a discussion, is emotionally engaging (e.g., sad or inspiring), or provides an opportunity to add value through a reply.
            - **Score 9-10**: Like and Share if the post is highly valuable, insightful, humorous, or beneficial to the user's network. If it is also discussion-worthy, add a Comment.
            
            Your response should follow this structured format:
            - If Like is chosen: `{ "like": true }`
            - If Comment is chosen: `{ "comment": true, "content": "Your comment text here" }`
            - If Share is chosen: `{ "share": true }`
            - If multiple actions are chosen, return a combination of the above.
            
            **Response Structure for Multiple Actions:**
            - If Like and Comment: `{ "like": true, "comment": true, "content": "Your comment text here" }`
            - If Like and Share: `{ "like": true, "share": true }`
            - If Comment and Share: `{ "comment": true, "content": "Your comment text here", "share": true }`
            - If Like, Comment, and Share: `{ "like": true, "comment": true, "content": "Your comment text here", "share": true }`
            
            Provide a brief reason for your decision if a comment is suggested.
            """
        },
           {
            "user": f"""
            Here is a social media post:
            
            ---
            {post_content}
            ---
            
            Based on the content, should I like, comment, or share this post? Provide a structured response according to the instructions.
            """
        }
    ]

  llm =  LLM(LLM_Type.GPT_4o)
  response = llm.ask(prompt)

  try:
    return json.loads(response)

  except Exception as e:
    raise e

