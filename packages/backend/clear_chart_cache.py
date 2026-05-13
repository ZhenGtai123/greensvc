"""Clear chart-summary narrative cache.

Required: stop the backend (uvicorn) first, otherwise SQLite is locked.

Usage (Windows PowerShell):
    cd D:\learning\paper2\repo\scenerx\packages\backend
    # 1. Stop backend (Ctrl+C in the uvicorn window) or:
    #    Get-Process python | Where-Object {$_.MainWindowTitle -match 'uvicorn'} | Stop-Process
    python clear_chart_cache.py [--all|--clustering-only]

Default: --clustering-only (just busts entries for cluster-related charts so
the new GMM-BIC narratives regenerate; other cached chart summaries stay).
Use --all to nuke the whole cache.
"""
import sqlite3
import sys
import shutil
from pathlib import Path

DB = Path(__file__).parent / "data" / "chart_summary_cache.sqlite"

CLUSTERING_CHARTS = (
    'silhouette-curve',
    'dendrogram',
    'cluster-spatial-smoothing',
    'archetype-radar',
    'cluster-size-distribution',
    'cluster-spatial-overview',
    'archetype-narratives',
    'cluster-centroid-heatmap',
)

def main():
    mode = "clustering-only"
    if "--all" in sys.argv:
        mode = "all"

    if not DB.exists():
        print(f"No cache at {DB}")
        return 0

    # Make a backup just in case
    backup = DB.with_suffix(".sqlite.bak")
    try:
        shutil.copy(DB, backup)
        print(f"Backup created: {backup.name}")
    except Exception as e:
        print(f"WARNING: backup failed ({e}); continuing anyway")

    try:
        conn = sqlite3.connect(str(DB), timeout=30)
        conn.execute("PRAGMA busy_timeout = 30000")
        cur = conn.cursor()

        if mode == "all":
            cur.execute("SELECT COUNT(*) FROM chart_summary_cache")
            n = cur.fetchone()[0]
            cur.execute("DELETE FROM chart_summary_cache")
            conn.commit()
            print(f"Cleared ALL {n} cached narratives.")
        else:
            placeholders = ",".join("?" * len(CLUSTERING_CHARTS))
            cur.execute(
                f"SELECT chart_id, COUNT(*) FROM chart_summary_cache "
                f"WHERE chart_id IN ({placeholders}) GROUP BY chart_id",
                CLUSTERING_CHARTS,
            )
            rows = cur.fetchall()
            total = sum(n for _, n in rows)
            for cid, n in rows:
                print(f"  {cid}: {n} cached")
            cur.execute(
                f"DELETE FROM chart_summary_cache WHERE chart_id IN ({placeholders})",
                CLUSTERING_CHARTS,
            )
            conn.commit()
            print(f"Cleared {total} clustering-related cached narratives.")

        # Reclaim space
        cur.execute("VACUUM")
        conn.close()
        print("Done. Backend will regenerate narratives on next chart view.")
        return 0
    except sqlite3.OperationalError as e:
        print(f"\nERROR: {e}")
        print("→ The cache database is locked. Stop the backend (uvicorn) first:")
        print("  Windows: Ctrl+C in the uvicorn terminal, or Stop-Process in PowerShell")
        print("  Linux:   kill the uvicorn process")
        print("Then re-run this script.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
