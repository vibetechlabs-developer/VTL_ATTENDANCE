import pytest
import factory
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from users.models import Employee

User = get_user_model()


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    username = factory.Sequence(lambda n: f"user_{n}")
    email = factory.Sequence(lambda n: f"user_{n}@vtl.local")
    role = "employee"
    is_active = True

    @factory.post_generation
    def password(self, create, extracted, **kwargs):
        raw_password = extracted or "testpass123"
        self.set_password(raw_password)
        if create:
            self.save()


class EmployeeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Employee

    user = factory.SubFactory(UserFactory)
    name = factory.Faker("name")
    department = "Engineering"
    phone = "9876543210"


@pytest.fixture
def user_factory(db):
    return UserFactory


@pytest.fixture
def employee_factory(db):
    return EmployeeFactory


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def auth_client(api_client):
    """Fixture factory that returns an authenticated APIClient for a given employee or user."""
    def _create_auth_client(target=None):
        if target is None:
            target = EmployeeFactory()
        
        user = target.user if isinstance(target, Employee) else target
        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        return client

    return _create_auth_client


@pytest.fixture
def manager_employee(db):
    user = UserFactory(role="manager", username="mgr_user", email="mgr@vtl.local")
    return EmployeeFactory(user=user, name="Manager Employee", department="Engineering")


@pytest.fixture
def hr_admin_employee(db):
    user = UserFactory(role="admin", username="admin_user", email="admin@vtl.local")
    return EmployeeFactory(user=user, name="HR Admin Employee", department="HR")
