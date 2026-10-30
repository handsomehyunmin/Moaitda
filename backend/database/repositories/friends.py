import sqlite3
from contextlib import closing

from database import get_connection
from database.repositories.common import now


def _user_id(conn, username):
    row = conn.execute(
        "SELECT id FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    return row[0] if row else None


def send_request(sender_username, recipient_email):
    with closing(get_connection()) as conn, conn:
        sender_id = _user_id(conn, sender_username)
        recipient = conn.execute(
            "SELECT id FROM users WHERE lower(username) = lower(?)",
            (recipient_email,),
        ).fetchone()
        if not recipient:
            raise ValueError("해당 이메일로 가입한 사용자를 찾을 수 없습니다.")
        recipient_id = recipient[0]
        if sender_id == recipient_id:
            raise ValueError("자기 자신에게 친구 요청을 보낼 수 없습니다.")

        if conn.execute(
            "SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?",
            (min(sender_id, recipient_id), max(sender_id, recipient_id)),
        ).fetchone():
            raise ValueError("이미 친구인 사용자입니다.")

        existing = conn.execute(
            "SELECT status FROM friend_requests WHERE sender_id = ? AND receiver_id = ?",
            (sender_id, recipient_id),
        ).fetchone()
        if existing and existing[0] == "accepted":
            raise ValueError("이미 친구인 사용자입니다.")
        if existing and existing[0] == "pending":
            raise ValueError("이미 친구 요청을 보냈습니다.")
        if existing:
            conn.execute(
                "UPDATE friend_requests SET status = 'pending', created_at = ? WHERE sender_id = ? AND receiver_id = ?",
                (now(), sender_id, recipient_id),
            )
        else:
            conn.execute(
                "INSERT INTO friend_requests (sender_id, receiver_id, status, created_at) VALUES (?, ?, 'pending', ?)",
                (sender_id, recipient_id, now()),
            )
    return {"message": "친구 요청을 보냈습니다."}


def list_friends(username):
    with closing(get_connection()) as conn:
        conn.row_factory = sqlite3.Row
        user_id = _user_id(conn, username)
        return [dict(row) for row in conn.execute("""
            SELECT u.username AS email, u.nickname
            FROM friends f
            JOIN users u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END
            WHERE f.user_id = ? OR f.friend_id = ?
            ORDER BY u.nickname COLLATE NOCASE
        """, (user_id, user_id, user_id)).fetchall()]


def list_incoming_requests(username):
    with closing(get_connection()) as conn:
        conn.row_factory = sqlite3.Row
        user_id = _user_id(conn, username)
        return [dict(row) for row in conn.execute("""
            SELECT f.id, u.username AS email, u.nickname, f.created_at AS createdAt
            FROM friend_requests f
            JOIN users u ON u.id = f.sender_id
            WHERE f.receiver_id = ? AND f.status = 'pending'
            ORDER BY f.id DESC
        """, (user_id,)).fetchall()]


def respond_to_request(username, request_id, status):
    if status not in ("accepted", "rejected"):
        raise ValueError("올바르지 않은 친구 요청 상태입니다.")
    with closing(get_connection()) as conn, conn:
        user_id = _user_id(conn, username)
        result = conn.execute(
            "UPDATE friend_requests SET status = ? WHERE id = ? AND receiver_id = ? AND status = 'pending'",
            (status, request_id, user_id),
        )
        if result.rowcount == 0:
            raise ValueError("대기 중인 친구 요청을 찾을 수 없습니다.")
        if status == "accepted":
            sender_id, receiver_id = conn.execute(
                "SELECT sender_id, receiver_id FROM friend_requests WHERE id = ?",
                (request_id,),
            ).fetchone()
            conn.execute(
                "INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)",
                (min(sender_id, receiver_id), max(sender_id, receiver_id), now()),
            )
    return {"message": "친구 요청을 수락했습니다." if status == "accepted" else "친구 요청을 거절했습니다."}
