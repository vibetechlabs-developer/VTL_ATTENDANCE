from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0013_user_extra_roles"),
    ]

    operations = [
        migrations.AlterField(
            model_name="appnotification",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True, db_index=True),
        ),
    ]
