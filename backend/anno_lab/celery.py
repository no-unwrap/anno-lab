import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "anno_lab.settings")

app = Celery("anno_lab")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# Periodic task schedule
app.conf.beat_schedule = {
    'sync-open-mturk-hits': {
        'task': 'core.mturk.sync_open_hits',
        'schedule': crontab(minute='*/5'),  # Every 5 minutes
        'options': {'queue': 'mturk'},
    },
    'ingest-submitted-assignments': {
        'task': 'core.mturk.ingest_submitted_assignments',
        'schedule': crontab(minute='*/10'),  # Every 10 minutes
        'options': {'queue': 'mturk'},
    },
}
