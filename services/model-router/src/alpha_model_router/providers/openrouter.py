"""OpenRouter provider adapter.

OpenRouter (https://openrouter.ai) provides access to 100+ models via an
OpenAI-compatible API. Users need an OpenRouter API key (starts with sk-or-).

The API is compatible with OpenAI's chat completions format, with two
additions:
  - HTTP-Referer header (optional, for app identification)
  - X-Title header (optional, for app name)

Tool names must match ^[a-zA-Z0-9_-]+$ (same as OpenAI), so we reuse the
OpenAI adapter's _convert_tools method.
"""
from __future__ import annotations

from typing import Any, AsyncIterator

import httpx

from .base import RouterRequest, RouterResponse

# OpenRouter pricing is dynamic per-model. These are approximate for popular models.
# The actual cost is returned in the response and we use that when available.
_PRICING_PER_1M: dict[str, dict[str, float]] = {
    "anthropic/claude-sonnet-4.5": {"in": 3.0, "out": 15.0},
    "anthropic/claude-3.5-sonnet": {"in": 3.0, "out": 15.0},
    "openai/gpt-4o": {"in": 2.5, "out": 10.0},
    "openai/gpt-4o-mini": {"in": 0.15, "out": 0.6},
    "google/gemini-2.5-pro": {"in": 1.25, "out": 10.0},
    "google/gemini-2.5-flash": {"in": 0.075, "out": 0.3},
    "meta-llama/llama-3.3-70b-instruct": {"in": 0.23, "out": 0.4},
    "deepseek/deepseek-chat": {"in": 0.14, "out": 0.28},
    "qwen/qwen-2.5-72b-instruct": {"in": 0.23, "out": 0.4},
    "x-ai/grok-3": {"in": 5.0, "out": 15.0},
    "x-ai/grok-3-mini": {"in": 0.3, "out": 0.5},
}

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class OpenRouterAdapter:
    name = "openrouter"

    def _headers(self, req: RouterRequest) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {req.api_key}",
            "Content-Type": "application/json",
        }
        # Optional but recommended headers
        headers["HTTP-Referer"] = "http://localhost:5173"
        headers["X-Title"] = "ALPHA Agent"
        return headers

    def _convert_tools(self, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Convert Anthropic-style tool descriptors to OpenAI function format.

        Same as OpenAI: replace dots in tool names (fs.read -> fs_read).
        """
        converted = []
        for t in tools:
            if t.get("type") == "function" and "function" in t:
                fn = dict(t["function"])
                fn["name"] = fn.get("name", "").replace(".", "_")
                converted.append({**t, "function": fn})
                continue
            name = t.get("name", "").replace(".", "_")
            converted.append({
                "type": "function",
                "function": {
                    "name": name,
                    "description": t.get("description", ""),
                    "parameters": t.get("input_schema") or t.get("parameters") or {"type": "object", "properties": {}},
                },
            })
        return converted

    def _restore_tool_name(self, name: str) -> str:
        """Convert tool name back: fs_read -> fs.read"""
        for prefix in ["fs_", "git_", "shell_", "search_"]:
            if name.startswith(prefix):
                return prefix[:-1] + "." + name[len(prefix):]
        return name

    async def complete(self, req: RouterRequest) -> RouterResponse:
        headers = self._headers(req)
        kwargs: dict[str, Any] = {
            "model": req.model.model,
            "messages": ([{"role": "system", "content": req.system}] if req.system else [])
            + req.messages,
            "max_tokens": req.max_tokens,
            "temperature": req.temperature,
        }
        if req.tools:
            kwargs["tools"] = self._convert_tools(req.tools)
        if req.tool_choice:
            kwargs["tool_choice"] = req.tool_choice

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                json=kwargs,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()

        choice = data["choices"][0]
        message = choice["message"]
        content = message.get("content") or ""
        tool_calls = []
        if message.get("tool_calls"):
            import json
            for tc in message["tool_calls"]:
                tool_calls.append({
                    "id": tc.get("id", ""),
                    "name": self._restore_tool_name(tc["function"]["name"]),
                    "args": json.loads(tc["function"].get("arguments") or "{}"),
                })

        usage = data.get("usage", {})
        tokens_in = usage.get("prompt_tokens", 0)
        tokens_out = usage.get("completion_tokens", 0)

        return RouterResponse(
            model=req.model,
            content=content,
            tool_calls=tool_calls,
            usage={"tokens_in": tokens_in, "tokens_out": tokens_out},
            cost_usd=self.estimate_cost(req.model.model, tokens_in, tokens_out),
        )

    async def stream(self, req: RouterRequest) -> AsyncIterator[dict[str, Any]]:
        headers = self._headers(req)
        kwargs: dict[str, Any] = {
            "model": req.model.model,
            "messages": ([{"role": "system", "content": req.system}] if req.system else [])
            + req.messages,
            "max_tokens": req.max_tokens,
            "temperature": req.temperature,
            "stream": True,
        }
        if req.tools:
            kwargs["tools"] = self._convert_tools(req.tools)

        tokens_in = tokens_out = 0
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{OPENROUTER_BASE_URL}/chat/completions",
                json=kwargs,
                headers=headers,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    import json
                    chunk = json.loads(line[6:])
                    if chunk.get("usage"):
                        tokens_in = chunk["usage"].get("prompt_tokens", 0)
                        tokens_out = chunk["usage"].get("completion_tokens", 0)
                    if chunk.get("choices") and chunk["choices"][0].get("delta", {}).get("content"):
                        yield {"type": "delta", "text": chunk["choices"][0]["delta"]["content"]}

        yield {
            "type": "done",
            "usage": {"tokens_in": tokens_in, "tokens_out": tokens_out},
            "cost_usd": self.estimate_cost(req.model.model, tokens_in, tokens_out),
        }

    def estimate_cost(self, model: str, tokens_in: int, tokens_out: int) -> float:
        p = _PRICING_PER_1M.get(model, {"in": 1.0, "out": 2.0})
        return (tokens_in / 1_000_000) * p["in"] + (tokens_out / 1_000_000) * p["out"]
