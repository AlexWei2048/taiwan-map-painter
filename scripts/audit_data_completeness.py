#!/usr/bin/env python3
"""Regenerate data completeness reports through the site runtime loaders."""
import pathlib, subprocess
root = pathlib.Path(__file__).resolve().parents[1]
raise SystemExit(subprocess.call(['node', str(root/'scripts/audit_data_completeness.cjs')], cwd=root))
