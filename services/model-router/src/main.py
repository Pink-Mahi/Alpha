"""Entrypoint: uvicorn alpha_model_router.app:app --reload"""
import uvicorn

from alpha_model_router.app import app

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8081, log_level="info")
