import sqlite3
from contextlib import closing

from database import get_connection
from database.repositories.common import now


def _user_id(conn, username):
    row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    return row[0] if row else None


def _require_friends(conn, first_id, second_id):
    is_friend = conn.execute(
        "SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?",
        (min(first_id, second_id), max(first_id, second_id)),
    ).fetchone()
    if not is_friend:
        raise ValueError("친구와의 대화만 이용할 수 있습니다.")


def list_messages(username, friend_email, limit=100, after_id=None):
    with closing(get_connection()) as conn:
        conn.row_factory = sqlite3.Row
        user_id = _user_id(conn, username)
        friend = conn.execute(
            "SELECT id FROM users WHERE lower(username) = lower(?)",
            (friend_email,),
        ).fetchone()
        if not friend:
            raise ValueError("친구를 찾을 수 없습니다.")
        friend_id = friend["id"]
        _require_friends(conn, user_id, friend_id)
        rows = conn.execute("""
            SELECT m.id, sender.username AS senderEmail, sender.nickname AS senderNickname,
                receiver.username AS receiverEmail, m.content, m.created_at AS createdAt, m.read_at AS readAt
            FROM chat_messages m
            JOIN users sender ON sender.id = m.sender_id
            JOIN users receiver ON receiver.id = m.receiver_id
            WHERE ((m.sender_id = ? AND m.receiver_id = ?)
               OR (m.sender_id = ? AND m.receiver_id = ?))
               AND (? IS NULL OR m.id > ?)
            ORDER BY CASE WHEN ? IS NOT NULL THEN m.id END ASC, m.id DESC
            LIMIT ?
        """, (user_id, friend_id, friend_id, user_id, after_id, after_id, after_id, limit)).fetchall()
        return [dict(row) for row in (reversed(rows) if after_id is None else rows)]


def save_message(sender_username, receiver_email, content):
    with closing(get_connection()) as conn, conn:
        conn.row_factory = sqlite3.Row
        sender_id = _user_id(conn, sender_username)
        receiver = conn.execute(
            "SELECT id FROM users WHERE lower(username) = lower(?)",
            (receiver_email,),
        ).fetchone()
        if not receiver:
            raise ValueError("친구를 찾을 수 없습니다.")
        receiver_id = receiver["id"]
        _require_friends(conn, sender_id, receiver_id)
        created_at = now()
        result = conn.execute(
            "INSERT INTO chat_messages (sender_id, receiver_id, content, created_at) VALUES (?, ?, ?, ?)",
            (sender_id, receiver_id, content, created_at),
        )
        row = conn.execute("""
            SELECT m.id, sender.username AS senderEmail, sender.nickname AS senderNickname,
                receiver.username AS receiverEmail, m.content, m.created_at AS createdAt, m.read_at AS readAt
            FROM chat_messages m
            JOIN users sender ON sender.id = m.sender_id
            JOIN users receiver ON receiver.id = m.receiver_id
            WHERE m.id = ?
        """, (result.lastrowid,)).fetchone()
        return dict(row)


def unread_counts(username):
    with closing(get_connection()) as conn:
        return {row[0]: row[1] for row in conn.execute("""
            SELECT sender.username, COUNT(*) FROM chat_messages m
            JOIN users sender ON sender.id = m.sender_id
            JOIN users receiver ON receiver.id = m.receiver_id
            WHERE receiver.username = ? AND m.read_at IS NULL
            GROUP BY sender.username
        """, (username,)).fetchall()}


def mark_read(username, friend_email, through_id):
    with closing(get_connection()) as conn, conn:
        reader_id = _user_id(conn, username)
        friend = conn.execute("SELECT id, username FROM users WHERE lower(username) = lower(?)", (friend_email,)).fetchone()
        if not friend:
            raise ValueError("친구를 찾을 수 없습니다.")
        _require_friends(conn, reader_id, friend[0])
        timestamp = now()
        conn.execute("""
            UPDATE chat_messages SET read_at = ?
            WHERE sender_id = ? AND receiver_id = ? AND id <= ? AND read_at IS NULL
        """, (timestamp, friend[0], reader_id, through_id))
        return {"type": "read", "readerEmail": username, "senderEmail": friend[1],
                "throughId": through_id, "readAt": timestamp}
