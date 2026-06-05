from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .health import health_check, liveness, readiness
from .views import (
    AnnotationViewSet,
    AssetViewSet,
    AssignmentViewSet,
    PluginViewSet,
    ProjectViewSet,
    TaskDefinitionViewSet,
    TaskTypeViewSet,
    TaskViewSet,
)

router = DefaultRouter()
router.register(r"projects", ProjectViewSet, basename="project")
router.register(r"task-types", TaskTypeViewSet, basename="tasktype")
router.register(r"task-definitions", TaskDefinitionViewSet, basename="taskdefinition")
router.register(r"assets", AssetViewSet, basename="asset")
router.register(r"tasks", TaskViewSet, basename="task")
router.register(r"annotations", AnnotationViewSet, basename="annotation")
router.register(r"assignments", AssignmentViewSet, basename="assignment")
router.register(r"plugins", PluginViewSet, basename="plugin")

urlpatterns = [
    path("", include(router.urls)),
    path("tasks/<int:task_id>/annotate/", include("core.ui_urls")),
    path("health/", health_check, name="health_check"),
    path("health/liveness/", liveness, name="health_liveness"),
    path("health/readiness/", readiness, name="health_readiness"),
]
