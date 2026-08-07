"""Canonical agent protocol types shared by Python services.

Hand-authored to match ../schema/*.json for M0. A codegen step
(datamodel-code-generator) will regenerate these from JSON Schema in CI once
the schema stabilizes. Keep schema and models in sync.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Literal, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

PROTOCOL_VERSION = "1.0"


class Runtime(str, Enum):
    local = "local"
    cloud = "cloud"


class MemoryScope(str, Enum):
    session = "session"
    project = "project"
    user = "user"
    org = "org"


class SideEffect(str, Enum):
    none = "none"
    read = "read"
    write = "write"
    destructive = "destructive"


class StateEventKind(str, Enum):
    file_edit = "file_edit"
    shell = "shell"
    browser = "browser"
    git = "git"
    message = "message"
    call = "call"


class Risk(str, Enum):
    none = "none"
    low = "low"
    medium = "medium"
    high = "high"
    destructive = "destructive"


class ModelPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    preferred: list[str] | None = None
    max_cost_per_1k_usd: float | None = None
    max_latency_ms: int | None = None
    require_json: bool = False


class ToolDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    description: str | None = None
    input_schema: dict
    output_schema: dict
    permissions_required: list[str]
    side_effect: SideEffect
    cost_estimate_usd: float | None = None
    runtime: Literal["local", "cloud", "either"]
    voice_safe: bool


# --- Payloads ---------------------------------------------------------------


class TaskStart(BaseModel):
    model_config = ConfigDict(extra="forbid")
    spec: str
    repo_ref: str | None = None
    budget_usd: float = Field(ge=0)
    deadline: datetime
    runtime: Runtime
    tool_allowlist: list[str]
    model_policy: ModelPolicy
    memory_scope: list[MemoryScope]


class PlanStep(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str
    risk: Risk
    requires_approval: bool = False


class TaskPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    steps: list[PlanStep]


class ToolCall(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str
    tool: str
    args: dict


class ToolResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str
    output: object | None = None
    error: str | None = None


class StateEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: StateEventKind
    summary: str
    diff_ref: str | None = None


class Checkpoint(BaseModel):
    model_config = ConfigDict(extra="forbid")
    seq: int = Field(ge=0)
    state_ref: str
    fs_ref: str | None = None


class CostTick(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: str
    tokens_in: int = Field(default=0, ge=0)
    tokens_out: int = Field(default=0, ge=0)
    cost_usd: float = Field(ge=0)


class HumanCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str
    proposed_action: str
    diff_preview: str | None = None
    voice_prompt: str | None = None


class TaskComplete(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str
    artifacts: list[str] = Field(default_factory=list)
    pr_url: str | None = None
    cost_usd: float = Field(ge=0)
    duration_ms: int = Field(ge=0)


class TaskFailed(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str
    partial_state_ref: str | None = None
    cost_usd: float = Field(ge=0)


MessageType = Literal[
    "task.start",
    "task.plan",
    "tool.call",
    "tool.result",
    "state.event",
    "checkpoint",
    "cost.tick",
    "human.checkpoint",
    "task.complete",
    "task.failed",
]

Payload = Annotated[
    Union[
        TaskStart,
        TaskPlan,
        ToolCall,
        ToolResult,
        StateEvent,
        Checkpoint,
        CostTick,
        HumanCheckpoint,
        TaskComplete,
        TaskFailed,
    ],
    Field(discriminator=None),
]


class AgentMessageEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal["1.0"] = PROTOCOL_VERSION
    org_id: UUID
    run_id: UUID
    task_id: UUID
    parent_run_id: UUID | None = None
    seq: int = Field(ge=0)
    ts: datetime
    type: MessageType
    payload: Payload
