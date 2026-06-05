# Generated manually for anno-lab improvements

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_add_returned_status_and_actor_index'),
    ]

    operations = [
        # Add assigned_to field to Task model for internal annotator assignment
        migrations.AddField(
            model_name='task',
            name='assigned_to',
            field=models.CharField(
                blank=True,
                db_index=True,
                help_text='Optional annotator assignment (username, email, or worker ID).',
                max_length=128,
            ),
        ),
    ]
