# Generated manually for anno-lab improvements

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        # Add 'returned' status to Assignment.status choices
        migrations.AlterField(
            model_name='assignment',
            name='status',
            field=models.CharField(
                choices=[
                    ('created', 'created'),
                    ('submitted', 'submitted'),
                    ('approved', 'approved'),
                    ('rejected', 'rejected'),
                    ('returned', 'returned'),
                    ('expired', 'expired'),
                ],
                default='created',
                max_length=20,
            ),
        ),
        # Add index on Annotation.actor for worker quality analysis
        migrations.AddIndex(
            model_name='annotation',
            index=models.Index(fields=['actor'], name='anno_actor_idx'),
        ),
    ]
