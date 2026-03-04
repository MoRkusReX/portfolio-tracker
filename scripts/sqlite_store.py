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
          PRIMARY KEY (symbol, interval, candle_time)
        )
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
        volume = row.get("volume")
        try:
            volume_v = None if volume is None else float(volume)
        except Exception:
            volume_v = None
        rows.append((symbol, interval, candle_time, open_v, high_v, low_v, close_v, volume_v, source, fetched_at))
    if rows:
        conn.executemany(
            """
            INSERT INTO indicator_candles (
              symbol, interval, candle_time, open, high, low, close, volume, source, fetched_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(symbol, interval, candle_time) DO UPDATE SET
              open = excluded.open,
              high = excluded.high,
              low = excluded.low,
              close = excluded.close,
              volume = excluded.volume,
              source = excluded.source,
              fetched_at = excluded.fetched_at
            """,
            rows,
        )
        conn.commit()
    return {"ok": True, "inserted": len(rows), "fetchedAt": fetched_at}


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
        else:
            fail("Unsupported command")
        print(json.dumps(out))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
