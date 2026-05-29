from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("updates", "0005_alter_dailyupdate_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="dailyupdate",
            name="report_data",
            field=models.JSONField(blank=True, null=True),
        ),
    ]
