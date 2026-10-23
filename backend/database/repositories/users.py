from contextlib import closing

from database import get_connection


def _user_id(conn, username):
    row = conn.execute("""
        SELECT id
                FROM users
                WHERE username = ?
                ORDER BY id
                LIMIT 1
    """, (username,)).fetchone()
    if row is None:
        raise ValueError('Post author does not exist: ' + username)
    return row[0]


def create_user(username, password, nickname):
    with closing(get_connection()) as conn:
        try:
            conn.execute("""
                INSERT INTO users (
                                    username,
                                    password,
                                    nickname
                                )
                                VALUES (?, ?, ?)
            """, (username, password, nickname))
            conn.commit()
        except:
            conn.rollback()
            raise


def get_user(username):
    with closing(get_connection()) as conn:
        return conn.execute("""
            SELECT
                            username,
                            password,
                            nickname,
                            profile_image
                        FROM users
                        WHERE username = ?
                        ORDER BY id
                        LIMIT 1
        """, (username,)).fetchone()


def update_profile_image(username, image):
    with closing(get_connection()) as conn, conn:
        conn.execute('UPDATE users SET profile_image = ? WHERE username = ?', (image, username))
