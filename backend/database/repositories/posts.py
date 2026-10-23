import json
from contextlib import closing

from database import get_connection
from .common import now, _json_list
from .users import _user_id


def create_post(user_id, title, content):
    with closing(get_connection()) as conn:
        try:
            cursor = conn.execute("""
                INSERT INTO posts (
                                    user_id,
                                    title,
                                    content,
                                    created_at
                                )
                                VALUES (?, ?, ?, ?)
            """, (user_id, title, content, now()))
            conn.commit()
            return cursor.lastrowid
        except:
            conn.rollback()
            raise


def get_post(post_id):
    with closing(get_connection()) as conn:
        return conn.execute("""
            SELECT *
                        FROM posts
                        WHERE id = ?
        """, (post_id,)).fetchone()


def update_post(post_id, title, content):
    with closing(get_connection()) as conn:
        try:
            conn.execute("""
                UPDATE posts
                                SET
                                    title = ?,
                                    content = ?,
                                    updated_at = ?
                                WHERE id = ?
            """, (title, content, now(), post_id))
            conn.commit()
        except:
            conn.rollback()
            raise


def _delete_post(conn, post_id):
    conn.execute("""
        DELETE FROM comments
                WHERE post_id = ?
    """, (post_id,))
    conn.execute("""
        DELETE FROM posts
                WHERE id = ?
    """, (post_id,))


def delete_post(post_id):
    with closing(get_connection()) as conn:
        try:
            _delete_post(conn, post_id)
            conn.commit()
        except:
            conn.rollback()
            raise


def _post_row(conn, post_id):
    return conn.execute("""
        SELECT id
                FROM posts
                WHERE public_id = ?
                OR (
                    public_id IS NULL
                    AND CAST(id AS TEXT) = ?
                )
    """, (str(post_id), str(post_id))).fetchone()


def _serialize_post(conn, post_id):
    row = conn.execute("""
        SELECT
                    p.id,
                    p.public_id,
                    p.title,
                    p.content,
                    p.tags,
                    p.image,
                    u.username,
                    u.nickname,
                    p.created_at,
                    p.updated_at,
                    p.likes,
                    u.profile_image
                FROM posts p
                JOIN users u
                    ON u.id = p.user_id
                WHERE p.id = ?
    """, (post_id,)).fetchone()
    if row is None:
        return None
    comments = []
    comment_rows = conn.execute("""
        SELECT
                    c.id,
                    u.username,
                    u.nickname,
                    c.content,
                    c.created_at,
                    u.profile_image
                FROM comments c
                JOIN users u
                    ON u.id = c.user_id
                WHERE c.post_id = ?
                ORDER BY c.id
    """, (post_id,)).fetchall()
    for comment in comment_rows:
        comments.append({'authorImage': comment[5] or '', 'id': str(comment[0]), 'authorEmail': comment[1], 'authorName': comment[2], 'text': comment[3], 'createdAt': comment[4] or now()})
    tags = _json_list(row[4])
    likes = _json_list(row[10])
    post = {'authorImage': row[11] or '', 'id': row[1] or str(row[0]), 'title': row[2] or '', 'content': row[3] or '', 'tags': tags, 'image': row[5] or '', 'authorEmail': row[6], 'authorName': row[7], 'createdAt': row[8] or now(), 'likes': likes, 'comments': comments}
    if row[9]:
        post['updatedAt'] = row[9]
    return post


def list_uploaded_posts():
    with closing(get_connection()) as conn:
        posts = []
        rows = conn.execute("""
            SELECT id
                        FROM posts
                        ORDER BY
                            created_at DESC,
                            id DESC
        """).fetchall()
        for row in rows:
            post = _serialize_post(conn, row[0])
            if post is not None:
                posts.append(post)
        return posts


def find_uploaded_post(post_id):
    with closing(get_connection()) as conn:
        row = _post_row(conn, post_id)
        if not row:
            return None
        return _serialize_post(conn, row[0])


def _save_post(conn, post):
    row = _post_row(conn, post['id'])
    values = (post['title'], post['content'], json.dumps(post.get('tags', []), ensure_ascii=False), post.get('image', ''))
    if row:
        conn.execute("""
            UPDATE posts
                        SET
                            title = ?,
                            content = ?,
                            tags = ?,
                            image = ?,
                            updated_at = ?
                        WHERE id = ?
        """, (*values, post.get('updatedAt') or now(), row[0]))
    else:
        conn.execute("""
            INSERT INTO posts (
                            title,
                            content,
                            tags,
                            image,
                            public_id,
                            user_id,
                            created_at,
                            updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (*values, post['id'], _user_id(conn, post['authorEmail']), post.get('createdAt') or now(), post.get('updatedAt')))


def save_uploaded_post(post):
    with closing(get_connection()) as conn:
        try:
            _save_post(conn, post)
            conn.commit()
        except:
            conn.rollback()
            raise


def remove_uploaded_post(post_id):
    with closing(get_connection()) as conn:
        try:
            row = _post_row(conn, post_id)
            if row:
                _delete_post(conn, row[0])
            conn.commit()
        except:
            conn.rollback()
            raise


def toggle_post_like(post_id, username):
    with closing(get_connection()) as conn:
        try:
            row = _post_row(conn, post_id)
            if not row:
                return None
            _user_id(conn, username)
            conn.execute('BEGIN IMMEDIATE')
            likes_row = conn.execute("""
                SELECT likes
                                FROM posts
                                WHERE id = ?
            """, (row[0],)).fetchone()
            if likes_row is None:
                conn.rollback()
                return None
            likes = _json_list(likes_row[0])
            if username in likes:
                likes.remove(username)
            else:
                likes.append(username)
            conn.execute("""
                UPDATE posts
                                SET likes = ?
                                WHERE id = ?
            """, (json.dumps(likes, ensure_ascii=False), row[0]))
            conn.commit()
            return _serialize_post(conn, row[0])
        except:
            conn.rollback()
            raise
