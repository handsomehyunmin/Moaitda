
import base64
import binascii
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from secrets import token_urlsafe
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from schemas import (
    SignupRequest,
    LoginRequest,
    UploadPostRequest,
    UploadCommentRequest,
    ProfileImageRequest,
)

from database.init_db import initialize_database
from database.repositories import users, posts, comments, friends


sessions = {}


def issue_token(username):
    token = token_urlsafe(32)
    sessions[token] = username
    return token


def authenticated_user(authorization):
    token = (authorization or "").removeprefix("Bearer ")
    username = sessions.get(token)
    user = users.get_user(username) if username else None

    if not user:
        raise HTTPException(
            status_code=401,
            detail="다시 로그인해주세요."
        )

    return user


@asynccontextmanager
async def lifespan(app):
    initialize_database()
    yield


app = FastAPI(
    title="Moaitda API",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "message": "모아잇다 백엔드 서버 연결 성공!"
    }


@app.post("/signup")
def signup(data: SignupRequest):
    try:
        users.create_user(
            data.username,
            data.password,
            data.nickname
        )
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="이미 가입된 이메일입니다."
        )

    return {
        "message": "회원가입 성공",
        "token": issue_token(data.username),
        "username": data.username,
        "nickname": data.nickname,
        "profileImage": ""
    }


@app.post("/login")
def login(data: LoginRequest):
    user = users.get_user(data.username)

    if user is None or user[1] != data.password:
        raise HTTPException(
            status_code=401,
            detail="아이디 또는 비밀번호가 올바르지 않습니다."
        )

    return {
        "message": "로그인 성공",
        "token": issue_token(user[0]),
        "username": user[0],
        "nickname": user[2],
        "profileImage": user[3]
    }


def validate_image(image):
    if not image:
        return

    try:
        header, encoded = image.split(",", 1)

        supported_types = {
            "data:image/jpeg;base64",
            "data:image/png;base64",
            "data:image/gif;base64",
            "data:image/webp;base64"
        }

        if header not in supported_types:
            raise ValueError()

        image_bytes = base64.b64decode(
            encoded,
            validate=True
        )

        if len(image_bytes) > 2 * 1024 * 1024:
            raise ValueError()

    except (ValueError, binascii.Error):
        raise HTTPException(
            status_code=422,
            detail="2MB 이하의 이미지 파일을 선택해주세요."
        )


@app.get("/posts")
def list_posts(
    authorization: str = Header(default="")
):
    authenticated_user(authorization)
    return posts.list_uploaded_posts()


@app.get("/friends")
def list_friends(authorization: str = Header(default="")):
    user = authenticated_user(authorization)
    return friends.list_friends(user[0])


@app.post("/friends", status_code=201)
def send_friend_request(data: dict, authorization: str = Header(default="")):
    user = authenticated_user(authorization)
    email = str(data.get("email", "")).strip().lower()
    if not email:
        raise HTTPException(status_code=422, detail="친구 이메일을 입력해주세요.")
    try:
        return friends.send_request(user[0], email)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@app.get("/friends/requests")
def list_friend_requests(authorization: str = Header(default="")):
    user = authenticated_user(authorization)
    return friends.list_incoming_requests(user[0])


@app.post("/friends/requests/{request_id}/accept")
def accept_friend_request(request_id: int, authorization: str = Header(default="")):
    user = authenticated_user(authorization)
    try:
        return friends.respond_to_request(user[0], request_id, "accepted")
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))


@app.post("/friends/requests/{request_id}/reject")
def reject_friend_request(request_id: int, authorization: str = Header(default="")):
    user = authenticated_user(authorization)
    try:
        return friends.respond_to_request(user[0], request_id, "rejected")
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))


@app.post("/posts", status_code=201)
def upload_post(
    data: UploadPostRequest,
    authorization: str = Header(default="")
):
    user = authenticated_user(authorization)
    validate_image(data.image)

    post = {
        "id": str(uuid4()),
        "title": data.title,
        "content": data.content,
        "tags": data.tags,
        "image": data.image,
        "authorEmail": user[0],
        "authorName": user[2],
        "createdAt": datetime.now(
            timezone.utc
        ).isoformat(),
        "likes": [],
        "comments": []
    }

    posts.save_uploaded_post(post)
    return posts.find_uploaded_post(post["id"])


@app.put("/posts/{post_id}")
def edit_uploaded_post(
    post_id: str,
    data: UploadPostRequest,
    authorization: str = Header(default="")
):
    user = authenticated_user(authorization)
    post = posts.find_uploaded_post(post_id)

    if not post:
        raise HTTPException(
            status_code=404,
            detail="게시물을 찾을 수 없습니다."
        )

    if post["authorEmail"] != user[0]:
        raise HTTPException(
            status_code=403,
            detail="본인의 게시물만 수정할 수 있습니다."
        )

    validate_image(data.image)

    post.update(
        data.model_dump(),
        updatedAt=datetime.now(
            timezone.utc
        ).isoformat()
    )

    posts.save_uploaded_post(post)
    return posts.find_uploaded_post(post_id)


@app.delete("/posts/{post_id}")
def remove_uploaded_post(
    post_id: str,
    authorization: str = Header(default="")
):
    user = authenticated_user(authorization)
    post = posts.find_uploaded_post(post_id)

    if not post:
        raise HTTPException(
            status_code=404,
            detail="게시물을 찾을 수 없습니다."
        )

    if post["authorEmail"] != user[0]:
        raise HTTPException(
            status_code=403,
            detail="본인의 게시물만 삭제할 수 있습니다."
        )

    posts.remove_uploaded_post(post_id)

    return {
        "message": "게시물 삭제 성공"
    }


@app.post("/posts/{post_id}/comments", status_code=201)
def add_comment(
    post_id: str,
    data: UploadCommentRequest,
    authorization: str = Header(default="")
):
    user = authenticated_user(authorization)

    post = comments.add_post_comment(
        post_id,
        user[0],
        data.content
    )

    if post is None:
        raise HTTPException(
            status_code=404,
            detail="게시물을 찾을 수 없습니다."
        )

    return post


@app.post("/posts/{post_id}/likes")
def toggle_like(
    post_id: str,
    authorization: str = Header(default="")
):
    user = authenticated_user(authorization)

    post = posts.toggle_post_like(
        post_id,
        user[0]
    )

    if post is None:
        raise HTTPException(
            status_code=404,
            detail="게시물을 찾을 수 없습니다."
        )

    return post


@app.get("/me")
def get_profile(
    authorization: str = Header(default="")
):
    user = authenticated_user(authorization)

    return {
        "username": user[0],
        "nickname": user[2],
        "profileImage": user[3]
    }


@app.put("/me/profile-image")
def save_profile_image(
    data: ProfileImageRequest,
    authorization: str = Header(default="")
):
    user = authenticated_user(authorization)
    validate_image(data.image)

    users.update_profile_image(
        user[0],
        data.image
    )

    return {
        "username": user[0],
        "nickname": user[2],
        "profileImage": data.image
    }
