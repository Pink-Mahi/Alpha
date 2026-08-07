# Dockerfile for the Python model router service.
FROM python:3.12-slim AS base

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy and install deps
COPY services/model-router/pyproject.toml services/model-router/uv.lock ./
RUN uv sync --frozen --no-dev

# Copy source
COPY services/model-router/src ./src
COPY shared/agent-protocol/python ./shared/agent-protocol/python

ENV PYTHONPATH=/app/src:/app/shared/agent-protocol/python/src

EXPOSE 8081

CMD ["uv", "run", "uvicorn", "cascade_model_router.app:app", "--host", "0.0.0.0", "--port", "8081"]
