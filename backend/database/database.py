import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().with_name("board.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('PRAGMA busy_timeout = 30000')
    return conn
