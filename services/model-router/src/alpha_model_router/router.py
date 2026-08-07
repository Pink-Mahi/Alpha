"""Model router core: provider registry + routing policy.

Routes a canonical RouterRequest to the right provider adapter based on the
model id and policy (cost/latency/quality). M0: direct routing by requested
model; smart fallback (cheapest-meeting-policy) lands in M1.
"""
from __future__ import annotations

from typing import AsyncIterator

from .providers.base import ModelId, ProviderAdapter, RouterRequest, RouterResponse
from .providers.anthropic import AnthropicAdapter
from .providers.openai import OpenAIAdapter
from .providers.openrouter import OpenRouterAdapter


class ModelRouter:
    def __init__(self) -> None:
        self._adapters: dict[str, ProviderAdapter] = {}
        self.register(AnthropicAdapter())
        self.register(OpenAIAdapter())
        self.register(OpenRouterAdapter())

    def register(self, adapter: ProviderAdapter) -> None:
        self._adapters[adapter.name] = adapter

    def get(self, provider: str) -> ProviderAdapter:
        try:
            return self._adapters[provider]
        except KeyError:
            raise ValueError(f"unknown provider: {provider}") from None

    def parse_model(self, model_id: str) -> ModelId:
        if ":" not in model_id:
            raise ValueError(f"model id must be '<provider>:<model>', got {model_id!r}")
        provider, model = model_id.split(":", 1)
        return ModelId(provider=provider, model=model)

    async def complete(self, model_id: str, req_kwargs: dict) -> RouterResponse:
        mid = self.parse_model(model_id)
        adapter = self.get(mid.provider)
        req = RouterRequest(model=mid, **req_kwargs)
        return await adapter.complete(req)

    async def stream(self, model_id: str, req_kwargs: dict) -> AsyncIterator[dict]:
        mid = self.parse_model(model_id)
        adapter = self.get(mid.provider)
        req = RouterRequest(model=mid, **req_kwargs)
        async for ev in adapter.stream(req):
            yield ev
