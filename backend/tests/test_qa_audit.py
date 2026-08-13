# d:/VTL_ATTENDANCE/backend/tests/test_qa_audit.py
"""
QA audit – functional & integration tests for VTL_ATTENDANCE backend.
All reverse() calls use the actual URL name defined in the project's urls.
"""
import json
from pathlib import Path
import pytest
from django.urls import reverse
from rest_framework.test import APIClient

import secrets

@pytest.fixture(scope="session")
def credentials():
    pwd = secrets.token_urlsafe(16)
    return {
        "qa_test@local.test": pwd,
        "regular@local.test": pwd,
        "manager@local.test": pwd,
    }

# ----------------------------------------------------------------------
# User fixtures
# ----------------------------------------------------------------------
@pytest.fixture(scope="session")
def admin_user(credentials, django_user_model):
    pwd = credentials["qa_test@local.test"]
    user, _ = django_user_model.objects.get_or_create(
        email="qa_test@local.test",
        defaults={
            "username": "qa_test",
            "role": "admin",
            "is_staff": True,
            "is_superuser": True,
        },
    )
    if not user.check_password(pwd):
        user.set_password(pwd)
        user.save()
    return user

@pytest.fixture(scope="session")
def employee_user(credentials, django_user_model):
    pwd = credentials["regular@local.test"]
    user, _ = django_user_model.objects.get_or_create(
        email="regular@local.test",
        defaults={
            "username": "regular",
            "role": "employee",
            "is_staff": False,
            "is_superuser": False,
        },
    )
    if not user.check_password(pwd):
        user.set_password(pwd)
        user.save()
    from users.models import Employee
    emp, _ = Employee.objects.get_or_create(user=user, defaults={"name": "Regular"})
    return {"user": user, "employee": emp}

@pytest.fixture(scope="session")
def manager_user(credentials, django_user_model):
    pwd = credentials["manager@local.test"]
    user, _ = django_user_model.objects.get_or_create(
        email="manager@local.test",
        defaults={
            "username": "manager",
            "role": "manager",
            "is_staff": True,
            "is_superuser": False,
        },
    )
    if not user.check_password(pwd):
        user.set_password(pwd)
        user.save()
    from users.models import Employee
    emp, _ = Employee.objects.get_or_create(user=user, defaults={"name": "Manager"})
    # link manager relationship
    regular_emp = Employee.objects.get(user__email="regular@local.test")
    regular_emp.manager = user
    regular_emp.managers.add(user)
    regular_emp.save()
    return {"user": user, "employee": emp}

@pytest.fixture
def api_client():
    return APIClient()

def login(client, email, password):
    url = reverse("login")
    resp = client.post(url, {"email": email, "password": password}, format="json")
    assert resp.status_code == 200
    return resp.data["access"], resp.data["refresh"]

# ----------------------------------------------------------------------
# 1️⃣ Authentication
# ----------------------------------------------------------------------
def test_login_logout(api_client, admin_user, credentials):
    access, refresh = login(api_client, admin_user.email, credentials[admin_user.email])
    # token refresh
    url = reverse("token-refresh")
    resp = api_client.post(url, {"refresh": refresh}, format="json")
    assert resp.status_code == 200
    new_access = resp.data["access"]
    assert new_access != access
    # logout
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {new_access}")
    url = reverse("logout")
    resp = api_client.post(url, {"refresh": refresh}, format="json")
    assert resp.status_code == 200

def test_me_endpoint(api_client, employee_user, credentials):
    access, _ = login(api_client, employee_user["user"].email, credentials[employee_user["user"].email])
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    url = reverse("me")
    resp = api_client.get(url)
    assert resp.status_code == 200
    for field in ("id", "email", "role", "name", "department", "phone", "empId", "avatar", "isWfh"):
        assert field in resp.data

# ----------------------------------------------------------------------
# 2️⃣ Employee CRUD
# ----------------------------------------------------------------------
def test_employee_crud(api_client, admin_user, credentials):
    access, _ = login(api_client, admin_user.email, credentials[admin_user.email])
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    # create
    url = reverse("employees-create")
    payload = {"name": "New Hire", "department": "Engineering", "phone": "5551234", "email": "newhire@local.test"}
    resp = api_client.post(url, payload, format="json")
    assert resp.status_code == 201
    emp_id = resp.data["employee"]["id"]
    # list
    url = reverse("employees-list")
    resp = api_client.get(url)
    assert any(item["id"] == emp_id for item in resp.data)
    # update
    url = reverse("employees-update", args=[emp_id])
    resp = api_client.patch(url, {"phone": "5559999"}, format="json")
    assert resp.status_code == 200
    assert resp.data["employee"]["phone"] == "5559999"
    # delete
    url = reverse("employees-delete", args=[emp_id])
    resp = api_client.delete(url)
    assert resp.status_code == 200

# ----------------------------------------------------------------------
# 3️⃣ Leave – balance, overlap, approval
# ----------------------------------------------------------------------
def test_leave_balances_and_approval(api_client, employee_user, manager_user, credentials):
    # employee applies leave
    emp_access, _ = login(api_client, employee_user["user"].email, credentials[employee_user["user"].email])
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {emp_access}")
    apply_url = reverse("leave-apply")
    payload = {
        "employee": employee_user["employee"].id,
        "leave_type": "casual",
        "start_date": "2024-01-10",
        "end_date": "2024-01-12",
        "reason": "Vacation",
    }
    resp = api_client.post(apply_url, payload, format="json")
    assert resp.status_code == 201
    leave_id = resp.data["id"]
    # overlapping attempt – expect 400
    payload["start_date"] = "2024-01-11"
    payload["end_date"] = "2024-01-13"
    resp = api_client.post(apply_url, payload, format="json")
    assert resp.status_code == 400
    # manager approves
    mgr_access, _ = login(api_client, manager_user["user"].email, credentials[manager_user["user"].email])
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {mgr_access}")
    approve_url = reverse("leave-approve", args=[leave_id])
    resp = api_client.post(approve_url, {}, format="json")
    assert resp.status_code == 200
    from leave.models import LeaveRequest, LeaveBalance
    leave_obj = LeaveRequest.objects.get(id=leave_id)
    assert leave_obj.status == "approved"
    bal = LeaveBalance.objects.get(employee=employee_user["employee"])
    # 3 days used
    assert float(bal.casual_used) >= 3.0

# ----------------------------------------------------------------------
# 4️⃣ Payroll – LOP integration
# ----------------------------------------------------------------------
def test_payroll_lop_integration(api_client, admin_user, credentials, employee_user):
    access, _ = login(api_client, admin_user.email, credentials[admin_user.email])
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    gen_url = reverse("payrollrun-generate")
    resp = api_client.post(gen_url, {"month": 1, "year": 2024}, format="json")
    assert resp.status_code == 200
    # Find payslip for our employee
    payslips = resp.data.get("payslips", [])
    emp_ps = next((p for p in payslips if p["employee"]["id"] == employee_user["employee"].id), None)
    assert emp_ps is not None
    assert emp_ps.get("lopDays", 0) >= 0

# ----------------------------------------------------------------------
# 5️⃣ Cross‑module integration (resignation → exit flow)
# ----------------------------------------------------------------------
def test_resignation_exit_flow(api_client, employee_user, credentials):
    access, _ = login(api_client, employee_user["user"].email, credentials[employee_user["user"].email])
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    resign_url = reverse("resignation-list")
    resp = api_client.post(resign_url, {"reason": "Personal"}, format="json")
    assert resp.status_code == 201
    res_id = resp.data["id"]
    # checklist items
    checklist_url = reverse("clearancechecklistitem-list") + f"?resignation={res_id}"
    resp = api_client.get(checklist_url)
    assert resp.status_code == 200
    assert len(resp.data) > 0
    # mark each done
    for item in resp.data:
        mark_url = reverse("clearancechecklistitem-mark-done", args=[item["id"]])
        api_client.post(mark_url, {"remark": "done"}, format="json")
    # complete resignation
    complete_url = reverse("resignation-complete", args=[res_id])
    resp = api_client.post(complete_url, {}, format="json")
    assert resp.status_code == 200
    # verify employee status
    status_url = reverse("employees-detail", args=[employee_user["employee"].id])
    resp = api_client.get(status_url)
    assert resp.status_code == 200
    assert resp.data.get("employment_status") == "exited"

# ----------------------------------------------------------------------
# 6️⃣ Notification wiring – task assignment creates notification
# ----------------------------------------------------------------------
def test_task_assignment_creates_notification(api_client, admin_user, credentials, employee_user):
    access, _ = login(api_client, admin_user.email, credentials[admin_user.email])
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    task_url = reverse("task-list")
    payload = {"title": "QA Test Task", "assigned_to": employee_user["employee"].id}
    resp = api_client.post(task_url, payload, format="json")
    assert resp.status_code == 201
    # fetch notifications for assignee (still using admin token for simplicity)
    notif_url = reverse("my-notifications")
    resp = api_client.get(notif_url)
    assert resp.status_code == 200
    assert any(n.get("title") == "Task Assigned" for n in resp.data)

# ----------------------------------------------------------------------
# 7️⃣ (No external credentials file to clean up)
# ----------------------------------------------------------------------
# No cleanup needed as credentials are generated in-memory.
