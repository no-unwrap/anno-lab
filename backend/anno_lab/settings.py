import os
from pathlib import Path

from dotenv import load_dotenv

from .settings_helpers import database_settings_from_env, env_csv, env_flag

BASE_DIR = Path(__file__).resolve().parent.parent
requested_env_file = os.getenv("ANNO_LAB_ENV_FILE", "").strip()
if requested_env_file:
    env_file = Path(requested_env_file)
    if not env_file.is_absolute():
        env_file = BASE_DIR.parent / env_file
    env_file = env_file.resolve()
    if not env_file.exists():
        raise RuntimeError(f"ANNO_LAB_ENV_FILE does not exist: {env_file}")
else:
    env_file = BASE_DIR.parent / ".env"

load_dotenv(env_file)

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-insecure")
DEBUG = env_flag("DJANGO_DEBUG", "0")
ALLOWED_HOSTS = env_csv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "drf_spectacular",
    "core",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "anno_lab.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "anno_lab.wsgi.application"

DATABASES = {"default": database_settings_from_env()}

AUTH_PASSWORD_VALIDATORS = []  # keep minimal; add later if needed

LANGUAGE_CODE = "en-us"
TIME_ZONE = "America/Denver"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# CORS stays open by default in local debug flows and closed by default otherwise.
CORS_ALLOW_ALL_ORIGINS = env_flag("CORS_ALLOW_ALL_ORIGINS", "1" if DEBUG else "0")
CORS_ALLOWED_ORIGINS = env_csv("CORS_ALLOWED_ORIGINS")

# DRF
REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
}

SPECTACULAR_SETTINGS = {
    "TITLE": "anno-lab API",
    "VERSION": "0.1.0",
}

# Simple write-token gate (optional but recommended).
WRITE_TOKEN = os.getenv("DJANGO_WRITE_TOKEN", "").strip()

# Celery
CELERY_BROKER_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CELERY_TASK_DEFAULT_QUEUE = "default"
CELERY_TASK_ROUTES = {
    "core.mturk.*": {"queue": "mturk"},
}

# AWS
AWS_REGION = os.getenv("AWS_REGION", "us-west-2")
S3_BUCKET = os.getenv("S3_BUCKET", "").strip()
USE_S3_PLUGINS = env_flag("USE_S3_PLUGINS", "0")
PLUGIN_S3_BUCKET = os.getenv("PLUGIN_S3_BUCKET", "").strip()
MTURK_SANDBOX = env_flag("MTURK_SANDBOX", "1")
MTURK_ENDPOINT = os.getenv("MTURK_ENDPOINT", "").strip()
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
