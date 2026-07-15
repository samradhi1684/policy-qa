from fastapi import Depends
from app.dependencies import get_current_user
from app.models.user import User
from fastapi.security import OAuth2PasswordRequestForm

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession


from app.dependencies import get_db

from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    OnboardingRequest,
)

from app.services.auth_service import (
    create_user,
    authenticate_user,
    get_user_by_email,
)

from app.core.security import create_access_token
from app.core.config import settings

import secrets


router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)


@router.post("/register")
async def register(
    request: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    existing_user = await get_user_by_email(
        db,
        request.email,
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered",
        )

    user = await create_user(
        db,
        request.email,
        request.username,
        request.password,
    )

    token = create_access_token(
        str(user.id)
    )

    return TokenResponse(
        access_token=token
    )


@router.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    user = await authenticate_user(
        db,
        form_data.username,
        form_data.password,
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
        )

    access_token = create_access_token(
        str(user.id)
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }

@router.get("/me")
async def get_me(
    current_user: User = Depends(get_current_user)
):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "username": current_user.username,
        "display_name": current_user.display_name,
        "role": current_user.role,
        "country": current_user.country,
        "onboarding_completed": current_user.onboarding_completed,
    }


@router.patch("/onboarding")
async def complete_onboarding(
    body: OnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.display_name = body.display_name
    current_user.role = body.role
    current_user.country = body.country
    current_user.onboarding_completed = True

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)

    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "username": current_user.username,
        "display_name": current_user.display_name,
        "role": current_user.role,
        "country": current_user.country,
        "onboarding_completed": current_user.onboarding_completed,
    }