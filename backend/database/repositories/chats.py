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


def list_messages(username, friend_email, limit=100):
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
                receiver.username AS receiverEmail, m.content, m.created_at AS createdAt
            FROM chat_messages m
            JOIN users sender ON sender.id = m.sender_id
            JOIN users receiver ON receiver.id = m.receiver_id
            WHERE (m.sender_id = ? AND m.receiver_id = ?)
               OR (m.sender_id = ? AND m.receiver_id = ?)
            ORDER BY m.id DESC
            LIMIT ?
        """, (user_id, friend_id, friend_id, user_id, limit)).fetchall()
        return [dict(row) for row in reversed(rows)]


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
                receiver.username AS receiverEmail, m.content, m.created_at AS createdAt
            FROM chat_messages m
            JOIN users sender ON sender.id = m.sender_id
            JOIN users receiver ON receiver.id = m.receiver_id
            WHERE m.id = ?
        """, (result.lastrowid,)).fetchone()
        return dict(row)
