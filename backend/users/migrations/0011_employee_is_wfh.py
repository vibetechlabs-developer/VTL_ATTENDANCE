from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0010_appraisal"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="is_wfh",
            field=models.BooleanField(default=False),
        ),
    ]
