web: gunicorn anno_lab.wsgi --bind 0.0.0.0:$PORT --chdir backend
worker: celery -A anno_lab worker -l INFO -Q default,mturk --workdir backend
beat: celery -A anno_lab beat -l INFO --workdir backend
