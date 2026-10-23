from pydantic import BaseModel


class SignupRequest(BaseModel):
    username: str
    password: str
    nickname: str


class LoginRequest(BaseModel):
    username: str
    password: str


class PostRequest(BaseModel):
    user_id: int
    title: str
    content: str


class CommentRequest(BaseModel):
    user_id: int
    content: str


from pydantic import Field, field_validator

class UploadPostRequest(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    content: str = Field(min_length=1, max_length=1000)
    tags: list[str] = Field(default_factory=list, max_length=6)
    image: str = Field(default="", max_length=2800000)

    @field_validator("title", "content")
    @classmethod
    def strip_required(cls, value):
        if not value.strip():
            raise ValueError("Title and content are required.")
        return value.strip()


class UploadCommentRequest(BaseModel):
    content: str = Field(min_length=1, max_length=1000)

    @field_validator("content")
    @classmethod
    def strip_required(cls, value):
        if not value.strip():
            raise ValueError("Comment content is required.")
        return value.strip()


class ProfileImageRequest(BaseModel):
    image: str = Field(max_length=2800000)
