"""Compatibility for the legacy ``app.main:app`` Uvicorn target."""

import importlib
import sys

main = importlib.import_module("main")
sys.modules[f"{__name__}.main"] = main
