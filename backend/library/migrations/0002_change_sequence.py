from django.db import migrations

from library.models import CHANGE_SEQUENCE


class Migration(migrations.Migration):
    dependencies = [("library", "0001_initial")]

    operations = [
        migrations.RunSQL(
            sql=f"CREATE SEQUENCE IF NOT EXISTS {CHANGE_SEQUENCE} START 1",
            reverse_sql=f"DROP SEQUENCE IF EXISTS {CHANGE_SEQUENCE}",
        ),
    ]
