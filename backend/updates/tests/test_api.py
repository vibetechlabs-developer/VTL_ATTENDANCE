import pytest
from rest_framework import status
from updates.models import DailyUpdate


@pytest.mark.django_db
def test_authenticated_employee_can_list_their_own_updates(auth_client, employee_factory):
    employee = employee_factory()
    client = auth_client(employee)

    DailyUpdate.objects.create(
        employee=employee,
        update_text="Completed initial task checklist"
    )

    response = client.get("/api/updates/")
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]["update_text"] == "Completed initial task checklist"


@pytest.mark.django_db
def test_unauthenticated_user_cannot_access_updates(api_client):
    response = api_client.get("/api/updates/")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_employee_can_submit_daily_update(auth_client, employee_factory):
    employee = employee_factory()
    client = auth_client(employee)

    payload = {"update_text": "Finished building backend tests structure"}
    response = client.post("/api/updates/", payload, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["message"] == "Update submitted successfully."
    assert DailyUpdate.objects.filter(employee=employee, update_text="Finished building backend tests structure").exists()
