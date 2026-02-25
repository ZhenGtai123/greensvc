"""SQLite-backed project store with dict-like read interface."""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
from datetime import datetime
from typing import Optional

from app.models.project import ProjectResponse

logger = logging.getLogger(__name__)

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT
);
"""


class ProjectStore:
    """Thread-safe SQLite store for ProjectResponse objects."""

    def __init__(self, db_path: str):
        self._db_path = db_path
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL;")
        self._conn.execute(_CREATE_TABLE)
        self._conn.commit()
        logger.info("ProjectStore initialized at %s", db_path)

    # -- read interface (no lock needed for WAL readers) --

    def get(self, project_id: str) -> Optional[ProjectResponse]:
        row = self._conn.execute(
            "SELECT data FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
        if row is None:
            return None
        return ProjectResponse.model_validate_json(row[0])

    def __contains__(self, project_id: str) -> bool:
        row = self._conn.execute(
            "SELECT 1 FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
        return row is not None

    def __getitem__(self, project_id: str) -> ProjectResponse:
        proj = self.get(project_id)
        if proj is None:
            raise KeyError(project_id)
        return proj

    def list(self, limit: int = 50, offset: int = 0) -> list[ProjectResponse]:
        rows = self._conn.execute(
            "SELECT data FROM projects ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        return [ProjectResponse.model_validate_json(r[0]) for r in rows]

    def values(self) -> list[ProjectResponse]:
        """Backward-compat: return all projects."""
        rows = self._conn.execute(
            "SELECT data FROM projects ORDER BY created_at DESC"
        ).fetchall()
        return [ProjectResponse.model_validate_json(r[0]) for r in rows]

    # -- write interface (locked) --

    def save(self, project: ProjectResponse) -> None:
        data = project.model_dump_json()
        created = project.created_at.isoformat() if project.created_at else None
        updated = project.updated_at.isoformat() if project.updated_at else None
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO projects (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (project.id, data, created, updated),
            )
            self._conn.commit()

    def delete(self, project_id: str) -> bool:
        with self._lock:
            cur = self._conn.execute(
                "DELETE FROM projects WHERE id = ?", (project_id,)
            )
            self._conn.commit()
            return cur.rowcount > 0

    def close(self) -> None:
        self._conn.close()
        logger.info("ProjectStore closed")


# -- module-level singleton --

_store: Optional[ProjectStore] = None


def init_project_store(db_path: str) -> ProjectStore:
    global _store
    if _store is not None:
        _store.close()
    _store = ProjectStore(db_path)
    return _store


def get_project_store() -> ProjectStore:
    if _store is None:
        raise RuntimeError("ProjectStore not initialized — call init_project_store() first")
    return _store
