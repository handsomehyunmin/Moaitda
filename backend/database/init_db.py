
from contextlib import closing

from database import DB_PATH, get_connection
from database.repositories.common import now


def initialize_database():
    with closing(get_connection()) as conn:
        conn.execute("PRAGMA journal_mode = WAL")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                nickname TEXT NOT NULL
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL
                    REFERENCES users(id),
                title TEXT NOT NULL,
                content TEXT NOT NULL
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER NOT NULL
                    REFERENCES posts(id)
                    ON DELETE CASCADE,
                user_id INTEGER NOT NULL
                    REFERENCES users(id),
                content TEXT NOT NULL
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS friend_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                UNIQUE(sender_id, receiver_id),
                CHECK(sender_id != receiver_id),
                CHECK(status IN ('pending', 'accepted', 'rejected'))
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS friends (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                UNIQUE(user_id, friend_id),
                CHECK(user_id < friend_id)
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS friends_friend_id ON friends(friend_id)
        """)
        conn.execute("""
            INSERT OR IGNORE INTO friends (user_id, friend_id, created_at)
            SELECT MIN(sender_id, receiver_id), MAX(sender_id, receiver_id), MIN(created_at)
            FROM friend_requests
            WHERE status = 'accepted'
            GROUP BY MIN(sender_id, receiver_id), MAX(sender_id, receiver_id)
        """)

        fields = {
            "users": {
                "profile_image":
                    "TEXT NOT NULL DEFAULT ''"
            },
            "posts": {
                "public_id": "TEXT",
                "tags": "TEXT NOT NULL DEFAULT '[]'",
                "image": "TEXT NOT NULL DEFAULT ''",
                "created_at": "TEXT",
                "updated_at": "TEXT",
                "likes": "TEXT NOT NULL DEFAULT '[]'"
            },
            "comments": {
                "created_at": "TEXT"
            }
        }

        for table, columns in fields.items():
            existing = {
                row[1]
                for row in conn.execute(
                    f"PRAGMA table_info({table})"
                )
            }

            for name, definition in columns.items():
                if name not in existing:
                    conn.execute(
                        f"ALTER TABLE {table} "
                        f"ADD COLUMN {name} {definition}"
                    )

        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS
            posts_public_id
            ON posts(public_id)
        """)

        conn.execute("""
            UPDATE posts
            SET created_at = ?
            WHERE created_at IS NULL
        """, (now(),))

        conn.execute("""
            UPDATE comments
            SET created_at = ?
            WHERE created_at IS NULL
        """, (now(),))

        conn.commit()


if __name__ == "__main__":
    initialize_database()
    print(f"Database initialized: {DB_PATH}")
