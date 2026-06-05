"""
Management command to load example datasets for demonstration purposes.
"""
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import connection

from core.models import Annotation, Asset, Project, Task, TaskDefinition, TaskType


class Command(BaseCommand):
    help = 'Load example dataset fixtures for demonstration and testing'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Clear existing example data before loading',
        )
        parser.add_argument(
            '--skip-confirmation',
            action='store_true',
            help='Skip confirmation prompt when using --reset',
        )

    def handle(self, *args, **options):
        reset = options['reset']
        skip_confirmation = options['skip_confirmation']

        if reset:
            if not skip_confirmation:
                self.stdout.write(
                    self.style.WARNING(
                        '\nWARNING: This will delete all existing data in the database!'
                    )
                )
                confirm = input('Are you sure you want to continue? [y/N]: ')
                if confirm.lower() != 'y':
                    self.stdout.write(self.style.ERROR('Aborted.'))
                    return

            self.stdout.write('Clearing existing data...')
            self._clear_data()
            self.stdout.write(self.style.SUCCESS('Data cleared.'))

        self.stdout.write('Loading example dataset...')

        try:
            call_command(
                'loaddata',
                'example_dataset.json',
                verbosity=2,
            )
            self.stdout.write(self.style.SUCCESS('\nExample dataset loaded successfully!'))
            self._print_summary()

        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'\nError loading example dataset: {str(e)}')
            )
            raise

    def _clear_data(self):
        """Clear all data from the database."""
        # Delete in correct order to respect foreign key constraints
        Annotation.objects.all().delete()
        Task.objects.all().delete()
        Asset.objects.all().delete()
        TaskDefinition.objects.all().delete()
        TaskType.objects.all().delete()
        Project.objects.all().delete()

        # Reset sequences if using PostgreSQL
        if connection.vendor == 'postgresql':
            with connection.cursor() as cursor:
                cursor.execute("SELECT setval('core_project_id_seq', 1, false);")
                cursor.execute("SELECT setval('core_asset_id_seq', 1, false);")
                cursor.execute("SELECT setval('core_tasktype_id_seq', 1, false);")
                cursor.execute("SELECT setval('core_taskdefinition_id_seq', 1, false);")
                cursor.execute("SELECT setval('core_task_id_seq', 1, false);")
                cursor.execute("SELECT setval('core_annotation_id_seq', 1, false);")

    def _print_summary(self):
        """Print a summary of the loaded data."""
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write(self.style.SUCCESS('Example Dataset Summary'))
        self.stdout.write('=' * 60)

        projects = Project.objects.all().order_by('id')
        self.stdout.write(f'\nProjects ({projects.count()}):')
        for project in projects:
            task_count = Task.objects.filter(project=project).count()
            annotation_count = Annotation.objects.filter(task__project=project).count()
            self.stdout.write(
                f'  [{project.id}] {project.slug}: '
                f'{task_count} tasks, {annotation_count} annotations'
            )

        task_types = TaskType.objects.all().order_by('id')
        self.stdout.write(f'\nTask Types ({task_types.count()}):')
        for tt in task_types:
            self.stdout.write(f'  [{tt.id}] {tt.slug}: {tt.name}')

        self.stdout.write(f'\nAssets: {Asset.objects.count()}')
        self.stdout.write(f'Task Definitions: {TaskDefinition.objects.count()}')
        self.stdout.write(f'Tasks: {Task.objects.count()}')
        self.stdout.write(
            f'  - Pending: {Task.objects.filter(status="pending").count()}'
        )
        self.stdout.write(
            f'  - Complete: {Task.objects.filter(status="complete").count()}'
        )
        self.stdout.write(f'Annotations: {Annotation.objects.count()}')

        self.stdout.write('\n' + '=' * 60)
        self.stdout.write('\nNext steps:')
        self.stdout.write('  1. Start the development server: python manage.py runserver')
        self.stdout.write('  2. View projects at: http://localhost:8000/api/projects/')
        self.stdout.write('  3. View project stats: http://localhost:8000/api/projects/1/stats/')
        self.stdout.write('  4. Export project data: http://localhost:8000/api/projects/1/export/')
        self.stdout.write('=' * 60 + '\n')
