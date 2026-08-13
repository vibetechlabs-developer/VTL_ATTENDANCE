from django.urls import path, include
from rest_framework.routers import DefaultRouter
from notifications.views import NotificationViewSet, AuditLogViewSet

router = DefaultRouter()
router.register('notifications', NotificationViewSet, basename='notification')
router.register('audit-logs', AuditLogViewSet, basename='auditlog')

urlpatterns = [
    path('', include(router.urls)),
]
