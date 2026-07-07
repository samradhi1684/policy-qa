from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    email: str
    username: str


class OnboardingRequest(BaseModel):
    display_name: str
    role: str
    country: str | None = None


class GoogleAuthRequest(BaseModel):
    id_token: str