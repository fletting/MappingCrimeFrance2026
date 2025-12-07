from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


# -------------------------
# MEDIA (photos / vidéos)
# -------------------------
class MediaAttachmentOut(BaseModel):
    id: int
    file_path: str
    media_type: str

    class Config:
        from_attributes = True


# -------------------------
# CRIME REPORTS
# -------------------------
class CrimeReportBase(BaseModel):
    crime_type: str
    description: Optional[str] = None
    date_time: datetime
    address: str
    postcode: str
    city: str
    latitude: float
    longitude: float


class CrimeReportCreate(CrimeReportBase):
    pass


class CrimeReportOut(CrimeReportBase):
    id: int
    attachments: List[MediaAttachmentOut] = []

    class Config:
        from_attributes = True  # équivalent de orm_mode=True


# -------------------------
# ALERT SUBSCRIPTIONS
# -------------------------
class AlertSubscriptionBase(BaseModel):
    email: str
    center_lat: float
    center_lng: float
    radius_km: float
    crime_types: List[str]


class AlertSubscriptionCreate(AlertSubscriptionBase):
    pass


class AlertSubscriptionOut(AlertSubscriptionBase):
    id: int
    is_active: bool

    class Config:
        from_attributes = True
# -------------------------
# USERS
# -------------------------
class UserBase(BaseModel):
    first_name: str
    last_name: str
    age: int | None = None
    email: str
    address: str | None = None
    postcode: str | None = None
    city: str | None = None


class UserCreate(UserBase):
    password: str  # mot de passe en clair seulement à la création


class UserOut(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
