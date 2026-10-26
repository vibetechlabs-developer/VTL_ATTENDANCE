from rest_framework import permissions

from users.role_utils import is_hr_or_admin, user_has_role


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and user_has_role(request.user, 'admin')
        )


class IsHR(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and user_has_role(request.user, 'hr')
        )


class IsEmployee(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and user_has_role(request.user, 'employee')
        )


class IsAdminOrHR(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and is_hr_or_admin(request.user))
