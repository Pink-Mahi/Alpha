"""Provider adapter interface.

Every provider adapter implements the same async surface so the router can
treat them uniformly. Adapters translate between our canonical request/response
shapes and the provider's SDK.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Protocol


@dataclass(slots=True)
class ModelId:
    """Canonical model id: `<provider>:<model>`."""

    provider: str
    model: str

    def __str__(self) -> str:
        return f"{self.provider}:{self.model}"


@dataclass(slots=True)
class RouterRequest:
    model: ModelId
    messages: list[dict[str, Any]]
    tools: list[dict[str, Any]] | None = None
    tool_choice: str | None = None
    max_tokens: int = 4096
    temperature: float = 0.0
    stream: bool = False
    system: str | None = None
    # BYO-key: the decrypted provider key to use. None => use managed key.
    api_key: str | None = None


@dataclass(slots=True)
class RouterResponse:
    model: ModelId
    content: str
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    usage: dict[str, int] = field(default_factory=dict)
    cost_usd: float = 0.0


class ProviderAdapter(Protocol):
    """A provider adapter. `id.provider` must match `name`."""

    name: str

    async def complete(self, req: RouterRequest) -> RouterResponse: ...

    async def stream(self, req: RouterRequest) -> AsyncIterator[dict[str, Any]]: ...

    def estimate_cost(self, model: str, tokens_in: int, tokens_out: int) -> float: ...
