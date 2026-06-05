"""Health check endpoints for monitoring and deployment readiness."""
from celery import current_app
from celery.app.control import Inspect
from django.core.cache import cache
from django.db import connection
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


def check_database():
    """Check if database connection is working."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return {"status": "ok", "message": "Database connection successful"}
    except Exception as e:
        return {"status": "error", "message": f"Database error: {str(e)}"}


def check_redis():
    """Check if Redis connection is working."""
    try:
        cache.set("health_check", "ok", timeout=10)
        value = cache.get("health_check")
        if value == "ok":
            return {"status": "ok", "message": "Redis connection successful"}
        else:
            return {"status": "error", "message": "Redis value mismatch"}
    except Exception as e:
        return {"status": "error", "message": f"Redis error: {str(e)}"}


def check_celery_workers():
    """Check if Celery workers are available."""
    try:
        inspector = Inspect(app=current_app)
        active_workers = inspector.active()

        if active_workers:
            worker_count = len(active_workers)
            return {
                "status": "ok",
                "message": f"{worker_count} worker(s) active",
                "workers": list(active_workers.keys()),
            }
        else:
            return {
                "status": "warning",
                "message": "No active Celery workers found",
                "workers": [],
            }
    except Exception as e:
        return {"status": "error", "message": f"Celery check error: {str(e)}"}


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    """
    Comprehensive health check endpoint.

    Returns HTTP 200 if all systems operational, HTTP 503 if any critical system is down.

    GET /api/health/
    """
    db_health = check_database()
    redis_health = check_redis()
    celery_health = check_celery_workers()

    overall_status = "ok"
    status_code = http_status.HTTP_200_OK

    # Database and Redis are critical
    if db_health["status"] == "error" or redis_health["status"] == "error":
        overall_status = "error"
        status_code = http_status.HTTP_503_SERVICE_UNAVAILABLE

    # Celery workers are important but not critical (warning only)
    elif celery_health["status"] == "error":
        overall_status = "degraded"
        status_code = http_status.HTTP_200_OK

    return Response(
        {
            "status": overall_status,
            "database": db_health,
            "redis": redis_health,
            "celery": celery_health,
        },
        status=status_code,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def liveness(request):
    """
    Simple liveness probe for container orchestration.

    Returns HTTP 200 if the service is running.

    GET /api/health/liveness/
    """
    return Response({"status": "ok"}, status=http_status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([AllowAny])
def readiness(request):
    """
    Readiness probe for container orchestration.

    Returns HTTP 200 if service is ready to accept traffic (database is accessible).

    GET /api/health/readiness/
    """
    db_health = check_database()

    if db_health["status"] == "ok":
        return Response({"status": "ready", "database": db_health}, status=http_status.HTTP_200_OK)
    else:
        return Response(
            {"status": "not_ready", "database": db_health},
            status=http_status.HTTP_503_SERVICE_UNAVAILABLE,
        )
