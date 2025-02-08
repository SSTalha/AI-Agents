from fastapi import FastAPI, HTTPException  # type: ignore
from analyze import analyze_content  # Already using absolute import
from pydantic import BaseModel # type: ignore
import uvicorn  # type: ignore

app = FastAPI()

class PostContent(BaseModel):
    platform: str
    post_content: str

@app.post("/analyze-post")
async def analyze_post(content: PostContent):
    try:
        result = analyze_content(content.platform, content.post_content)
        
        return {
            "status": "success",
            "data": result
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error analyzing post: {str(e)}"
        )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
