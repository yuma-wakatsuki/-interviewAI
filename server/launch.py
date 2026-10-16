"""Windows-friendly entry point for the local InterviewAI server."""
import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "server.main:app",
        host="127.0.0.1",
        port=int(os.environ.get("INTERVIEWAI_PORT", "8765")),
        reload=False,
    )
