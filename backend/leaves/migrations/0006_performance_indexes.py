from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("leaves", "0005_alter_leavebalance_id_alter_leaverequest_id_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="leaverequest",
            name="start_date",
            field=models.DateField(db_index=True),
        ),
        migrations.AlterField(
            model_name="leaverequest",
            name="end_date",
            field=models.DateField(db_index=True),
        ),
    ]
