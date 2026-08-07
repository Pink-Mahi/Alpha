"""OpenAI provider adapter. M0: non-streaming completion + cost estimate.

Pricing is approximate; verify against OpenAI's public price sheet before billing.
"""
from __future__ import annotations

from typing import Any, AsyncIterator

from openai import AsyncOpenAI

from .base import RouterRequest, RouterResponse

_PRICING_PER_1M = {
    "gpt-4o": {"in": 2.5, "out": 10.0},
    "gpt-4o-mini": {"in": 0.15, "out": 0.6},
    "gpt-4-turbo": {"in": 10.0, "out": 30.0},
    "o1": {"in": 15.0, "out": 60.0},
}


class OpenAIAdapter:
    name = "openai"

    def _client(self, req: RouterRequest) -> AsyncOpenAI:
        return AsyncOpenAI(api_key=req.api_key)

    def _convert_tools(self, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Convert Anthropic-style tool descriptors to OpenAI function format.

        Agent loop sends: { name, description, input_schema: {...} }
        OpenAI expects:   { type: "function", function: { name, description, parameters: {...} } }
        """
        converted = []
        for t in tools:
            # Already in OpenAI format?
            if t.get("type") == "function" and "function" in t:
                converted.append(t)
                continue
            # Anthropic format — convert
            converted.append({
                "type": "function",
                "function": {
                    "name": t.get("name", ""),
                    "description": t.get("description", ""),
                    "parameters": t.get("input_schema") or t.get("parameters") or {"type": "object", "properties": {}},
                },
            })
        return converted

    async def complete(self, req: RouterRequest) -> RouterResponse:
        client = self._client(req)
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

        resp = await client.chat.completions.create(**kwargs)
        choice = resp.choices[0]
        content = choice.message.content or ""
        tool_calls = []
        if choice.message.tool_calls:
            import json

            for tc in choice.message.tool_calls:
                tool_calls.append(
                    {
                        "id": tc.id,
                        "name": tc.function.name,
                        "args": json.loads(tc.function.arguments or "{}"),
                    }
                )
        tokens_in = resp.usage.prompt_tokens if resp.usage else 0
        tokens_out = resp.usage.completion_tokens if resp.usage else 0
        return RouterResponse(
            model=req.model,
            content=content,
            tool_calls=tool_calls,
            usage={"tokens_in": tokens_in, "tokens_out": tokens_out},
            cost_usd=self.estimate_cost(req.model.model, tokens_in, tokens_out),
        )

    async def stream(self, req: RouterRequest) -> AsyncIterator[dict[str, Any]]:
        client = self._client(req)
        kwargs: dict[str, Any] = {
            "model": req.model.model,
            "messages": ([{"role": "system", "content": req.system}] if req.system else [])
            + req.messages,
            "max_tokens": req.max_tokens,
            "temperature": req.temperature,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if req.tools:
            kwargs["tools"] = self._convert_tools(req.tools)

        tokens_in = tokens_out = 0
        async for chunk in await client.chat.completions.create(**kwargs):
            if chunk.usage:
                tokens_in = chunk.usage.prompt_tokens
                tokens_out = chunk.usage.completion_tokens
            if chunk.choices and chunk.choices[0].delta.content:
                yield {"type": "delta", "text": chunk.choices[0].delta.content}
        yield {
            "type": "done",
            "usage": {"tokens_in": tokens_in, "tokens_out": tokens_out},
            "cost_usd": self.estimate_cost(req.model.model, tokens_in, tokens_out),
        }

    def estimate_cost(self, model: str, tokens_in: int, tokens_out: int) -> float:
        p = _PRICING_PER_1M.get(model, {"in": 2.5, "out": 10.0})
        return (tokens_in / 1_000_000) * p["in"] + (tokens_out / 1_000_000) * p["out"]
