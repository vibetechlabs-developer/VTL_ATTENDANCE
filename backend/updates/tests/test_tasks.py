import pytest
from django.utils import timezone
from datetime import timedelta
from updates.models import Task


@pytest.mark.django_db
def test_super_admin_can_assign_task_to_anyone(employee_factory, api_client):
    admin_emp = employee_factory()
    admin_user = admin_emp.user
    admin_user.role = 'admin'
    admin_user.is_superuser = True
    admin_user.save()

    target_emp = employee_factory()

    api_client.force_authenticate(user=admin_user)
    due_time = (timezone.now() + timedelta(days=3)).isoformat()

    response = api_client.post('/api/updates/tasks/', {
        'title': 'Super Admin Assignment',
        'description': 'Assigning to team member.',
        'assigned_to': target_emp.id,
        'priority': 'urgent',
        'due_datetime': due_time,
    })

    assert response.status_code == 201
    assert response.data['title'] == 'Super Admin Assignment'
    assert response.data['assigned_to'] == target_emp.id


@pytest.mark.django_db
def test_manager_can_only_assign_task_to_subordinates(employee_factory, api_client):
    manager_emp = employee_factory()
    manager_user = manager_emp.user
    manager_user.role = 'manager'
    manager_user.save()

    subordinate_emp = employee_factory()
    subordinate_emp.manager = manager_user
    subordinate_emp.save()

    other_emp = employee_factory()

    api_client.force_authenticate(user=manager_user)
    due_time = (timezone.now() + timedelta(days=2)).isoformat()

    # Success: Assigning to subordinate
    res_sub = api_client.post('/api/updates/tasks/', {
        'title': 'Subordinate Task',
        'assigned_to': subordinate_emp.id,
        'priority': 'high',
        'due_datetime': due_time,
    })
    assert res_sub.status_code == 201

    # Failure 403: Assigning to non-subordinate employee
    res_other = api_client.post('/api/updates/tasks/', {
        'title': 'Other Task',
        'assigned_to': other_emp.id,
        'priority': 'high',
        'due_datetime': due_time,
    })
    assert res_other.status_code == 403


@pytest.mark.django_db
def test_employee_and_intern_cannot_assign_tasks(employee_factory, api_client):
    emp = employee_factory()
    emp.user.role = 'employee'
    emp.user.save()

    intern = employee_factory()
    intern.user.role = 'intern'
    intern.user.save()

    target = employee_factory()
    due_time = (timezone.now() + timedelta(days=1)).isoformat()

    # Employee attempt
    api_client.force_authenticate(user=emp.user)
    res_emp = api_client.post('/api/updates/tasks/', {
        'title': 'Forbidden Task',
        'assigned_to': target.id,
        'due_datetime': due_time,
    })
    assert res_emp.status_code == 403

    # Intern attempt
    api_client.force_authenticate(user=intern.user)
    res_intern = api_client.post('/api/updates/tasks/', {
        'title': 'Forbidden Task Intern',
        'assigned_to': target.id,
        'due_datetime': due_time,
    })
    assert res_intern.status_code == 403


@pytest.mark.django_db
def test_employee_can_accept_and_complete_task_and_manager_reviews_it(employee_factory, api_client):
    manager_emp = employee_factory()
    manager_user = manager_emp.user
    manager_user.role = 'manager'
    manager_user.save()

    target_emp = employee_factory()
    target_emp.manager = manager_user
    target_emp.save()

    task = Task.objects.create(
        title='Submit Sales Pipeline Report',
        description='Generate monthly B2B lead list.',
        assigned_to=target_emp,
        assigned_by=manager_user,
        priority='urgent',
        due_datetime=timezone.now() + timedelta(days=1),
        status='pending'
    )

    # 1. Employee starts task
    api_client.force_authenticate(user=target_emp.user)
    res1 = api_client.patch(f'/api/updates/tasks/{task.id}/', {'status': 'in_progress'})
    assert res1.status_code == 200
    assert res1.data['status'] == 'in_progress'

    # 2. Employee completes task with notes
    res2 = api_client.patch(f'/api/updates/tasks/{task.id}/', {
        'status': 'completed',
        'completion_notes': 'Report exported and shared via email.'
    })
    assert res2.status_code == 200
    assert res2.data['status'] == 'completed'
    assert res2.data['completion_notes'] == 'Report exported and shared via email.'
    assert res2.data['completed_at'] is not None

    # 3. Manager reviews task and marks reviewed
    api_client.force_authenticate(user=manager_user)
    res3 = api_client.patch(f'/api/updates/tasks/{task.id}/', {'status': 'reviewed'})
    assert res3.status_code == 200
    assert res3.data['status'] == 'reviewed'

