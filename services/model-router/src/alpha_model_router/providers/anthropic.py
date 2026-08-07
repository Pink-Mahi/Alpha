"""Anthropic provider adapter (Claude). M0: non-streaming completion + cost estimate.

Pricing is approximate and must be kept in sync with Anthropic's public price
sheet. Updated 2026-08; verify before relying on it for billing.
"""
from __future__ import annotations

from typing import Any, AsyncIterator

from anthropic import AsyncAnthropic

from .base import RouterRequest, RouterResponse

# Per 1M tokens, USD. Keep in sync with provider pricing.
_PRICING_PER_1M = {
    "claude-3-5-sonnet-latest": {"in": 3.0, "out": 15.0},
    "claude-3-5-haiku-latest": {"in": 0.8, "out": 4.0},
    "claude-3-opus-latest": {"in": 15.0, "out": 75.0},
}


class AnthropicAdapter:
    name = "anthropic"

    def _client(self, req: RouterRequest) -> AsyncAnthropic:
        return AsyncAnthropic(api_key=req.api_key)  # None falls back to env ANTHROPIC_API_KEY

    async def complete(self, req: RouterRequest) -> RouterResponse:
        client = self._client(req)
        kwargs: dict[str, Any] = {
            "model": req.model.model,
            "max_tokens": req.max_tokens,
            "temperature": req.temperature,
            "messages": req.messages,
        }
        if req.system:
            kwargs["system"] = req.system
        if req.tools:
            kwargs["tools"] = req.tools
        if req.tool_choice:
            kwargs["tool_choice"] = {"type": req.tool_choice}

        resp = await client.messages.create(**kwargs)
        content_parts = [b.text for b in resp.content if b.type == "text"]
        tool_calls = [
            {
                "id": b.id,
                "name": b.name,
                "args": b.input,
            }
            for b in resp.content
            if b.type == "tool_use"
        ]
        tokens_in = resp.usage.input_tokens
        tokens_out = resp.usage.output_tokens
        return RouterResponse(
            model=req.model,
            content="".join(content_parts),
            tool_calls=tool_calls,
            usage={"tokens_in": tokens_in, "tokens_out": tokens_out},
            cost_usd=self.estimate_cost(req.model.model, tokens_in, tokens_out),
        )

    async def stream(self, req: RouterRequest) -> AsyncIterator[dict[str, Any]]:
        client = self._client(req)
        kwargs: dict[str, Any] = {
            "model": req.model.model,
            "max_tokens": req.max_tokens,
            "temperature": req.temperature,
            "messages": req.messages,
        }
        if req.system:
            kwargs["system"] = req.system
        async with client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield {"type": "delta", "text": text}
            final = await stream.get_final_message()
            yield {
                "type": "done",
                "usage": {
                    "tokens_in": final.usage.input_tokens,
                    "tokens_out": final.usage.output_tokens,
                },
                "cost_usd": self.estimate_cost(req.model.model, final.usage.input_tokens, final.usage.output_tokens),
            }

    def estimate_cost(self, model: str, tokens_in: int, tokens_out: int) -> float:
        p = _PRICING_PER_1M.get(model, {"in": 3.0, "out": 15.0})
        return (tokens_in / 1_000_000) * p["in"] + (tokens_out / 1_000_000) * p["out"]
