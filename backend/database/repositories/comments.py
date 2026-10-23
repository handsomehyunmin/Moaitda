from contextlib import closing

from database import get_connection
from .common import now
from .users import _user_id
from .posts import _post_row, _serialize_post


def create_comment(post_id, user_id, content):
    with closing(get_connection()) as conn:
        try:
            cursor = conn.execute("""
                INSERT INTO comments (
                                    post_id,
                                    user_id,
                                    content,
                                    created_at
                                )
                                VALUES (?, ?, ?, ?)
            """, (post_id, user_id, content, now()))
            conn.commit()
            return cursor.lastrowid
        except:
            conn.rollback()
            raise


def get_comments(post_id):
    with closing(get_connection()) as conn:
        return conn.execute("""
            SELECT *
                        FROM comments
                        WHERE post_id = ?
                        ORDER BY id
        """, (post_id,)).fetchall()


def delete_comment(comment_id):
    with closing(get_connection()) as conn:
        try:
            conn.execute("""
                DELETE FROM comments
                                WHERE id = ?
            """, (comment_id,))
            conn.commit()
        except:
            conn.rollback()
            raise


def add_post_comment(post_id, username, content):
    with closing(get_connection()) as conn:
        try:
            row = _post_row(conn, post_id)
            if not row:
                return None
            conn.execute("""
                INSERT INTO comments (
                                    post_id,
                                    user_id,
                                    content,
                                    created_at
                                )
                                VALUES (?, ?, ?, ?)
            """, (row[0], _user_id(conn, username), content, now()))
            conn.commit()
            return _serialize_post(conn, row[0])
        except:
            conn.rollback()
            raise
