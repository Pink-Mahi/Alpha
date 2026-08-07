"""FastAPI app for the model router.

M0 surface:
  GET  /healthz
  POST /v1/complete          -> non-streaming completion
  POST /v1/stream            -> SSE streaming completion

Auth: M0 trusts an internal header set by the control plane via mTLS in prod;
locally it's unauthenticated. Real auth lands with the agent-control integration.
"""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .router import ModelRouter

app = FastAPI(title="ALPHA-model-router", version="0.0.0")
router = ModelRouter()


class CompleteRequest(BaseModel):
    model: str = Field(..., description="<provider>:<model>, e.g. anthropic:claude-3-5-sonnet-latest")
    messages: list[dict[str, Any]]
    tools: list[dict[str, Any]] | None = None
    tool_choice: str | None = None
    max_tokens: int = 4096
    temperature: float = 0.0
    system: str | None = None
    api_key: str | None = None  # BYO-key


@app.get("/healthz")
async def healthz() -> dict[str, Any]:
    return {"ok": True, "providers": list(router._adapters.keys())}


@app.post("/v1/complete")
async def complete(req: CompleteRequest) -> dict[str, Any]:
    try:
        resp = await router.complete(
            req.model,
            {
                "messages": req.messages,
                "tools": req.tools,
                "tool_choice": req.tool_choice,
                "max_tokens": req.max_tokens,
                "temperature": req.temperature,
                "system": req.system,
                "api_key": req.api_key,
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        # Auth errors should not be retried by the client
        status = 502
        msg = str(e)
        if "authentication" in msg.lower() or "401" in msg or "api_key" in msg.lower():
            status = 401
        elif "rate_limit" in msg.lower() or "429" in msg:
            status = 429
        raise HTTPException(status_code=status, detail=f"provider error: {msg}")
    return {
        "model": str(resp.model),
        "content": resp.content,
        "tool_calls": resp.tool_calls,
        "usage": resp.usage,
        "cost_usd": resp.cost_usd,
    }


@app.post("/v1/stream")
async def stream(req: CompleteRequest) -> StreamingResponse:
    async def gen():
        try:
            async for ev in router.stream(
                req.model,
                {
                    "messages": req.messages,
                    "tools": req.tools,
                    "tool_choice": req.tool_choice,
                    "max_tokens": req.max_tokens,
                    "temperature": req.temperature,
                    "system": req.system,
                    "api_key": req.api_key,
                },
            ):
                import json

                yield f"data: {json.dumps(ev)}\n\n"
        except ValueError as e:
            import json

            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
