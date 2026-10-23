from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware

from schemas import SignupRequest, LoginRequest, UploadPostRequest, UploadCommentRequest, ProfileImageRequest

from init_db import initialize_database
from repositories import users, posts, comments


from secrets import token_urlsafe
from datetime import datetime, timezone
from uuid import uuid4
import base64
import binascii

sessions = {}

def issue_token(username):
    token = token_urlsafe(32)
    sessions[token] = username
    return token

def authenticated_user(authorization):
    username = sessions.get((authorization or "").removeprefix("Bearer "))
    user = users.get_user(username) if username else None
    if not user:
        raise HTTPException(status_code=401, detail="Please log in again.")
    return user

@asynccontextmanager
async def lifespan(app):
    initialize_database()
    yield


app = FastAPI(lifespan=lifespan)


# =========================================================
# CORS 설정
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# 서버 연결 확인
# =========================================================

@app.get("/")
def home():
    return {
        "message": "백엔드 서버 연결 성공!"
    }


# =========================================================
# 회원가입
# =========================================================

@app.post("/signup")
def signup(data: SignupRequest):
    users.create_user(
        data.username,
        data.password,
        data.nickname
    )

    return {
        "message": "회원가입 성공",
        "token": issue_token(data.username),
        "username": data.username,
        "nickname": data.nickname,
        "profileImage": ""
    }


# =========================================================
# 로그인
# =========================================================

@app.post("/login")
def login(data: LoginRequest):
    user = users.get_user(data.username)

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="아이디 또는 비밀번호가 올바르지 않습니다."
        )

    username = user[0]
    password = user[1]
    nickname = user[2]

    if password != data.password:
        raise HTTPException(
            status_code=401,
            detail="아이디 또는 비밀번호가 올바르지 않습니다."
        )

    return {
        "message": "로그인 성공",
        "token": issue_token(username),
        "username": username,
        "nickname": nickname,
        "profileImage": user[3]
    }


def validate_image(image):
    if not image:
        return
    try:
        header, encoded = image.split(",", 1)
        if header not in {"data:image/jpeg;base64", "data:image/png;base64", "data:image/gif;base64", "data:image/webp;base64"}:
            raise ValueError()
        if len(base64.b64decode(encoded, validate=True)) > 2 * 1024 * 1024:
            raise ValueError()
    except (ValueError, binascii.Error):
        raise HTTPException(status_code=422, detail="Select a supported image up to 2MB.")

@app.get("/posts")
def list_posts(authorization: str = Header(default="")):
    authenticated_user(authorization)
    return posts.list_uploaded_posts()

@app.post("/posts", status_code=201)
def upload_post(data: UploadPostRequest, authorization: str = Header(default="")):
    user = authenticated_user(authorization)
    validate_image(data.image)
    post = dict(id=str(uuid4()), title=data.title, content=data.content,
                tags=data.tags, image=data.image, authorEmail=user[0], authorName=user[2],
                createdAt=datetime.now(timezone.utc).isoformat(), likes=[], comments=[])
    posts.save_uploaded_post(post)
    return posts.find_uploaded_post(post["id"])

@app.put("/posts/{post_id}")
def edit_uploaded_post(post_id: str, data: UploadPostRequest, authorization: str = Header(default="")):
    user = authenticated_user(authorization)
    post = posts.find_uploaded_post(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    if post["authorEmail"] != user[0]:
        raise HTTPException(status_code=403, detail="You can only edit your own posts.")
    validate_image(data.image)
    post.update(data.model_dump(), updatedAt=datetime.now(timezone.utc).isoformat())
    posts.save_uploaded_post(post)
    return post

@app.delete("/posts/{post_id}")
def remove_uploaded_post(post_id: str, authorization: str = Header(default="")):
    user = authenticated_user(authorization)
    post = posts.find_uploaded_post(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    if post["authorEmail"] != user[0]:
        raise HTTPException(status_code=403, detail="You can only delete your own posts.")
    posts.remove_uploaded_post(post_id)
    return {"message": "Deleted."}

@app.post("/posts/{post_id}/comments", status_code=201)
def add_comment(post_id: str, data: UploadCommentRequest, authorization: str = Header(default="")):
    user = authenticated_user(authorization)
    post = comments.add_post_comment(post_id, user[0], data.content)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found.")
    return post


@app.post("/posts/{post_id}/likes")
def toggle_like(post_id: str, authorization: str = Header(default="")):
    user = authenticated_user(authorization)
    post = posts.toggle_post_like(post_id, user[0])
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found.")
    return post


@app.get("/me")
def get_profile(authorization: str = Header(default="")):
    user = authenticated_user(authorization)
    return {"username": user[0], "nickname": user[2], "profileImage": user[3]}


@app.put("/me/profile-image")
def save_profile_image(data: ProfileImageRequest, authorization: str = Header(default="")):
    user = authenticated_user(authorization)
    validate_image(data.image)
    users.update_profile_image(user[0], data.image)
    return {"username": user[0], "nickname": user[2], "profileImage": data.image}
