#!/usr/bin/env python3
# Implements the small SQLite command bridge used by the Node server.
import json
import os
import sqlite3
import sys


# Emits a JSON error and terminates the helper process.
def fail(message, code=1):
    print(json.dumps({"error": str(message)}))
    sys.exit(code)


# Returns the current UTC time as epoch milliseconds.
def utc_now_ms():
    import time
    return int(time.time() * 1000)


# Creates the SQLite tables and indexes used by the app if they do not exist.
def ensure_schema(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS app_state (
          state_key TEXT PRIMARY KEY,
          payload_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS indicator_candles (
          symbol TEXT NOT NULL,
          interval TEXT NOT NULL,
          candle_time TEXT NOT NULL,
          open REAL NOT NULL,
          high REAL NOT NULL,
          low REAL NOT NULL,
          close REAL NOT NULL,
          volume REAL,
          source TEXT,
          fetched_at INTEGER NOT NULL,
          last_accessed_at INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (symbol, interval, candle_time)
        )
        """
    )
    try:
        conn.execute("ALTER TABLE indicator_candles ADD COLUMN last_accessed_at INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    conn.execute(
        """
        UPDATE indicator_candles
        SET last_accessed_at = fetched_at
        WHERE last_accessed_at IS NULL OR last_accessed_at <= 0
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_indicator_lookup
        ON indicator_candles (symbol, interval, candle_time)
        """
    )
    conn.commit()


# Reads an optional JSON payload from stdin.
def read_stdin_json(default):
    raw = sys.stdin.read()
    if not raw:
        return default
    return json.loads(raw)


# Opens the database, ensures its directory exists, and initializes the schema.
def connect(db_path):
    db_dir = os.path.dirname(db_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    ensure_schema(conn)
    return conn


# Reads a named app-state JSON blob from SQLite.
def get_state(conn, key):
    row = conn.execute(
        "SELECT payload_json, updated_at FROM app_state WHERE state_key = ?",
        (key,),
    ).fetchone()
    if not row:
        return {"found": False, "payload": None, "updatedAt": 0}
    try:
        payload = json.loads(row["payload_json"])
    except Exception:
        payload = None
    return {
        "found": True,
        "payload": payload,
        "updatedAt": int(row["updated_at"] or 0),
    }


# Upserts a named app-state JSON blob into SQLite.
def set_state(conn, key):
    payload = read_stdin_json(None)
    if payload is None:
        fail("Missing JSON payload")
    updated_at = utc_now_ms()
    conn.execute(
        """
        INSERT INTO app_state (state_key, payload_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(state_key) DO UPDATE SET
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at
        """,
        (key, json.dumps(payload, separators=(",", ":")), updated_at),
    )
    conn.commit()
    return {"ok": True, "updatedAt": updated_at}


# Returns aggregate row counts and freshness info for a symbol/interval pair.
def indicator_summary(conn, symbol, interval):
    row = conn.execute(
        """
        SELECT COUNT(*) AS count, MAX(fetched_at) AS latest_fetched_at
        FROM indicator_candles
        WHERE symbol = ? AND interval = ?
        """,
        (symbol, interval),
    ).fetchone()
    return {
        "count": int((row["count"] if row else 0) or 0),
        "latestFetchedAt": int((row["latest_fetched_at"] if row else 0) or 0),
    }


# Reads the latest indicator candles for a symbol/interval pair.
def get_candles(conn, symbol, interval, limit):
    accessed_at = utc_now_ms()
    conn.execute(
        """
        UPDATE indicator_candles
        SET last_accessed_at = ?
        WHERE symbol = ? AND interval = ?
        """,
        (accessed_at, symbol, interval),
    )
    rows = conn.execute(
        """
        SELECT candle_time, open, high, low, close, volume, fetched_at, source
        FROM (
          SELECT *
          FROM indicator_candles
          WHERE symbol = ? AND interval = ?
          ORDER BY candle_time DESC
          LIMIT ?
        )
        ORDER BY candle_time ASC
        """,
        (symbol, interval, limit),
    ).fetchall()
    values = []
    latest_fetched_at = 0
    for row in rows:
        latest_fetched_at = max(latest_fetched_at, int(row["fetched_at"] or 0))
        values.append(
            {
                "datetime": row["candle_time"],
                "open": row["open"],
                "high": row["high"],
                "low": row["low"],
                "close": row["close"],
                "volume": row["volume"],
                "fetchedAt": int(row["fetched_at"] or 0),
                "source": row["source"],
            }
        )
    return {
        "values": values,
        "count": len(values),
        "latestFetchedAt": latest_fetched_at,
    }


# Upserts incoming indicator candles into SQLite using timestamp dedupe keys.
def upsert_candles(conn):
    payload = read_stdin_json({})
    symbol = str(payload.get("symbol", "")).strip().upper()
    interval = str(payload.get("interval", "")).strip().lower()
    candles = payload.get("candles")
    fetched_at = int(payload.get("fetchedAt") or utc_now_ms())
    source = str(payload.get("source", "")).strip() or None
    if not symbol or not interval:
        fail("Missing symbol or interval")
    if not isinstance(candles, list):
        fail("Missing candles array")
    rows = []
    for row in candles:
        candle_time = str((row or {}).get("datetime") or (row or {}).get("date") or (row or {}).get("time") or "").strip()
        if not candle_time:
            continue
        try:
            open_v = float(row["open"])
            high_v = float(row["high"])
            low_v = float(row["low"])
            close_v = float(row["close"])
        except Exception:
            continue
        if open_v <= 0 or high_v <= 0 or low_v <= 0 or close_v <= 0:
            continue
        if high_v < low_v:
            continue
        volume = row.get("volume")
        try:
            volume_v = None if volume is None else float(volume)
        except Exception:
            volume_v = None
        rows.append((symbol, interval, candle_time, open_v, high_v, low_v, close_v, volume_v, source, fetched_at, fetched_at))
    if rows:
        conn.executemany(
            """
            INSERT INTO indicator_candles (
              symbol, interval, candle_time, open, high, low, close, volume, source, fetched_at, last_accessed_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(symbol, interval, candle_time) DO UPDATE SET
              open = excluded.open,
              high = excluded.high,
              low = excluded.low,
              close = excluded.close,
              volume = excluded.volume,
              source = excluded.source,
              fetched_at = excluded.fetched_at,
              last_accessed_at = excluded.last_accessed_at
            """,
            rows,
        )
        conn.commit()
    return {"ok": True, "inserted": len(rows), "fetchedAt": fetched_at}


def pinned_indicator_symbols(conn):
    row = conn.execute(
        "SELECT payload_json FROM app_state WHERE state_key = ?",
        ("portfolio",),
    ).fetchone()
    if not row:
        return set()
    try:
        payload = json.loads(row["payload_json"])
    except Exception:
        return set()
    portfolio = payload.get("portfolio") if isinstance(payload, dict) and isinstance(payload.get("portfolio"), dict) else payload
    if not isinstance(portfolio, dict):
        return set()
    pinned = set()
    for item in portfolio.get("stocks", []):
        if not isinstance(item, dict):
            continue
        symbol = str(item.get("yahooSymbol") or item.get("symbol") or "").strip().upper()
        if symbol:
            pinned.add(symbol)
    for item in portfolio.get("crypto", []):
        if not isinstance(item, dict):
            continue
        symbol = str(item.get("symbol") or "").strip().upper()
        if symbol:
            pinned.add(f"{symbol}/USD")
    return pinned


def prune_stale_indicators(conn, max_age_ms):
    cutoff = utc_now_ms() - max(0, int(max_age_ms))
    pinned = sorted(pinned_indicator_symbols(conn))
    if pinned:
        placeholders = ",".join("?" for _ in pinned)
        cur = conn.execute(
            f"""
            DELETE FROM indicator_candles
            WHERE last_accessed_at < ?
              AND symbol NOT IN ({placeholders})
            """,
            [cutoff] + pinned,
        )
    else:
        cur = conn.execute(
            """
            DELETE FROM indicator_candles
            WHERE last_accessed_at < ?
            """,
            (cutoff,),
        )
    conn.commit()
    return {"ok": True, "deleted": int(cur.rowcount or 0)}


# Deletes app_state rows under a key prefix when they are older than max_age_ms.
def prune_stale_state_prefix(conn, prefix, max_age_ms):
    safe_prefix = str(prefix or "").strip()
    if not safe_prefix:
        fail("Missing state prefix")
    cutoff = utc_now_ms() - max(0, int(max_age_ms))
    payload = read_stdin_json({})
    exclude_keys = []
    exclude_like = []
    if isinstance(payload, dict):
        raw_keys = payload.get("excludeKeys")
        if isinstance(raw_keys, list):
            for key in raw_keys:
                safe_key = str(key or "").strip()
                if safe_key:
                    exclude_keys.append(safe_key)
        raw_like = payload.get("excludeLikePatterns")
        if isinstance(raw_like, list):
            for pattern in raw_like:
                safe_pattern = str(pattern or "").strip()
                if safe_pattern:
                    exclude_like.append(safe_pattern)

    sql = """
        DELETE FROM app_state
        WHERE state_key LIKE ?
          AND updated_at < ?
    """
    params = [safe_prefix + "%", cutoff]
    if exclude_keys:
        placeholders = ",".join("?" for _ in exclude_keys)
        sql += f"\n          AND state_key NOT IN ({placeholders})"
        params.extend(exclude_keys)
    if exclude_like:
        sql += "".join(["\n          AND state_key NOT LIKE ?" for _ in exclude_like])
        params.extend(exclude_like)

    cur = conn.execute(sql, params)
    conn.commit()
    return {"ok": True, "deleted": int(cur.rowcount or 0)}


# Dispatches command-line requests to the appropriate SQLite helper action.
def main():
    if len(sys.argv) < 3:
        fail("Usage: sqlite_store.py <db_path> <command> [args...]")
    db_path = sys.argv[1]
    command = sys.argv[2]
    conn = connect(db_path)
    try:
        if command == "init":
            out = {"ok": True}
        elif command == "get_state":
            if len(sys.argv) < 4:
                fail("Missing state key")
            out = get_state(conn, sys.argv[3])
        elif command == "set_state":
            if len(sys.argv) < 4:
                fail("Missing state key")
            out = set_state(conn, sys.argv[3])
        elif command == "indicator_summary":
            if len(sys.argv) < 5:
                fail("Missing symbol or interval")
            out = indicator_summary(conn, sys.argv[3], sys.argv[4])
        elif command == "get_candles":
            if len(sys.argv) < 6:
                fail("Missing symbol, interval, or limit")
            out = get_candles(conn, sys.argv[3], sys.argv[4], max(1, int(sys.argv[5])))
        elif command == "upsert_candles":
            out = upsert_candles(conn)
        elif command == "prune_stale_indicators":
            if len(sys.argv) < 4:
                fail("Missing max age")
            out = prune_stale_indicators(conn, int(sys.argv[3]))
        elif command == "prune_stale_state_prefix":
            if len(sys.argv) < 5:
                fail("Missing state prefix or max age")
            out = prune_stale_state_prefix(conn, sys.argv[3], int(sys.argv[4]))
        else:
            fail("Unsupported command")
        print(json.dumps(out))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
