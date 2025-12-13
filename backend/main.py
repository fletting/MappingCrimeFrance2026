from fastapi import HTTPException, status
from passlib.context import CryptContext
from sqlalchemy.exc import IntegrityError

from typing import List

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

origins = [
    "http://localhost:8000",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    # ton site Netlify en prod :
    "https://thunderous-hamster-452ee6.netlify.app",
]

from sqlalchemy.orm import Session

from .database import Base, engine, SessionLocal
from . import models, schemas

# Création des tables dans la base SQLite
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="MappingCrimeFrance API",
    description="API pour déclarations citoyennes d'infractions",
    version="0.1.0",
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# ----------------------------------------
# CORS (autoriser le frontend en local)
# ----------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # à restreindre plus tard (domaine réel du site)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------------------------
# Session de base de données
# ----------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ----------------------------------------
# ROUTE DE TEST
# ----------------------------------------
@app.get("/")
def read_root():
    return {"message": "API MappingCrimeFrance OK"}

# ----------------------------------------
# USERS : INSCRIPTION & LOGIN SIMPLE
# ----------------------------------------

@app.post("/api/register", response_model=schemas.UserOut)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # Vérifier si l'email existe déjà
    existing = db.query(models.User).filter(models.User.email == user.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un compte existe déjà avec cet email.",
        )

    db_user = models.User(
        first_name=user.first_name,
        last_name=user.last_name,
        age=user.age,
        email=user.email,
        password_hash=hash_password(user.password),
        address=user.address,
        postcode=user.postcode,
        city=user.city,
    )

    db.add(db_user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Erreur lors de la création de l'utilisateur.",
        )

    db.refresh(db_user)
    return db_user


class LoginRequest(schemas.BaseModel):  # petit schéma local
    email: str
    password: str


@app.post("/api/login", response_model=schemas.UserOut)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants invalides.",
        )

    # Pour un vrai site, on renverrait un token (JWT, etc.).
    return user



# ----------------------------------------
# CRÉER UNE DÉCLARATION
# ----------------------------------------
@app.post("/api/reports", response_model=schemas.CrimeReportOut)
def create_report(report: schemas.CrimeReportCreate, db: Session = Depends(get_db)):
    db_report = models.CrimeReport(
        crime_type=report.crime_type,
        description=report.description,
        date_time=report.date_time,
        address=report.address,
        postcode=report.postcode,
        city=report.city,
        latitude=report.latitude,
        longitude=report.longitude,
    )
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    return db_report


# ----------------------------------------
# LISTER TOUTES LES DÉCLARATIONS
# ----------------------------------------
@app.get("/api/reports", response_model=List[schemas.CrimeReportOut])
def list_reports(db: Session = Depends(get_db)):
    reports = db.query(models.CrimeReport).all()
    return reports


# ----------------------------------------
# CRÉER UN ABONNEMENT D'ALERTE
# ----------------------------------------
@app.post("/api/alerts", response_model=schemas.AlertSubscriptionOut)
def create_alert_subscription(
    alert: schemas.AlertSubscriptionCreate,
    db: Session = Depends(get_db),
):
    # on stocke les types de crimes comme une chaîne "Vol,Cambriolage"
    crime_types_str = ",".join(alert.crime_types)

    db_alert = models.AlertSubscription(
        email=alert.email,
        center_lat=alert.center_lat,
        center_lng=alert.center_lng,
        radius_km=alert.radius_km,
        crime_types=crime_types_str,
        is_active=True,
    )
    db.add(db_alert)
    db.commit()
    db.refresh(db_alert)

    # on renvoie au format List[str] pour le frontend
    return schemas.AlertSubscriptionOut(
        id=db_alert.id,
        email=db_alert.email,
        center_lat=db_alert.center_lat,
        center_lng=db_alert.center_lng,
        radius_km=db_alert.radius_km,
        crime_types=alert.crime_types,
        is_active=db_alert.is_active,
    )


# ----------------------------------------
# LISTER LES ABONNEMENTS (pour contrôle)
# ----------------------------------------
@app.get("/api/alerts", response_model=List[schemas.AlertSubscriptionOut])
def list_alerts(db: Session = Depends(get_db)):
    alerts = db.query(models.AlertSubscription).all()
    result: List[schemas.AlertSubscriptionOut] = []
    for a in alerts:
        types_list = a.crime_types.split(",") if a.crime_types else []
        result.append(
            schemas.AlertSubscriptionOut(
                id=a.id,
                email=a.email,
                center_lat=a.center_lat,
                center_lng=a.center_lng,
                radius_km=a.radius_km,
                crime_types=types_list,
                is_active=a.is_active,
            )
        )
    return result
