import pytest
from updates.models import DailyUpdate


@pytest.mark.django_db
def test_daily_update_creation(employee_factory):
    employee = employee_factory()
    update = DailyUpdate.objects.create(
        employee=employee,
        update_text="Worked on automated API testing setup."
    )
    assert update.pk is not None
    assert str(update) == f"Update - {employee.name} - {update.date}"
