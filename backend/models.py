from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    Boolean,
    ForeignKey,
)
from sqlalchemy.orm import relationship

from .database import Base
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    age = Column(Integer, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    address = Column(String, nullable=True)
    postcode = Column(String, nullable=True)
    city = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class CrimeReport(Base):
    __tablename__ = "crime_reports"

    id = Column(Integer, primary_key=True, index=True)
    crime_type = Column(String, index=True)
    description = Column(String, nullable=True)
    date_time = Column(DateTime)
    address = Column(String)
    postcode = Column(String)
    city = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)

    # pièces jointes (photos / vidéos)
    attachments = relationship(
        "MediaAttachment",
        back_populates="report",
        cascade="all, delete-orphan",
    )


class MediaAttachment(Base):
    __tablename__ = "media_attachments"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("crime_reports.id"))
    file_path = Column(String)      # chemin du fichier sur le disque
    media_type = Column(String)     # MIME type (image/jpeg, video/mp4, …)
    created_at = Column(DateTime, default=datetime.utcnow)

    report = relationship("CrimeReport", back_populates="attachments")


class AlertSubscription(Base):
    __tablename__ = "alert_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, index=True)
    center_lat = Column(Float)
    center_lng = Column(Float)
    radius_km = Column(Float)
    crime_types = Column(String)  # ex: "Vol,Cambriolage,Agression"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

