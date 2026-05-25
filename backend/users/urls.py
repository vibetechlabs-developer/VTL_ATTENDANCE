from django.urls import path
from .views import (
    LoginView, TokenRefreshView, LogoutView, MeView,
    EmployeesListView, EmployeesCreateView,
    EmployeesUpdateView, EmployeesDeleteView, MeUpdateView, EmployeeFaceRegisterByAdminView,
    AuditLogsView, SecurityOverviewView, EmployeeFaceDataView,
    PushPublicKeyView, PushSubscribeView, PushUnsubscribeView, PushLunchReminderView,
    MyNotificationsView, MarkNotificationsReadView,
    AppraisalCreateView, MyAppraisalsView,
)

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('me/', MeView.as_view(), name='me'),
    path('me/update/', MeUpdateView.as_view(), name='me-update'),
    path('employees/', EmployeesListView.as_view(), name='employees-list'),
    path('employees/create/', EmployeesCreateView.as_view(), name='employees-create'),
    path('employees/<int:pk>/update/', EmployeesUpdateView.as_view(), name='employees-update'),
    path('employees/<int:pk>/delete/', EmployeesDeleteView.as_view(), name='employees-delete'),
    path('employees/<int:pk>/register-face/', EmployeeFaceRegisterByAdminView.as_view(), name='employees-register-face'),
    path('employees/<int:pk>/face-data/', EmployeeFaceDataView.as_view(), name='employees-face-data'),
    path('audit-logs/', AuditLogsView.as_view(), name='audit-logs'),
    path('security-overview/', SecurityOverviewView.as_view(), name='security-overview'),
    # Backwards-compat alias (some clients call underscore route)
    path('security_overview/', SecurityOverviewView.as_view(), name='security-overview-underscore'),
    path('push/public-key/', PushPublicKeyView.as_view(), name='push-public-key'),
    path('push/subscribe/', PushSubscribeView.as_view(), name='push-subscribe'),
    path('push/unsubscribe/', PushUnsubscribeView.as_view(), name='push-unsubscribe'),
    path('push/send-lunch/', PushLunchReminderView.as_view(), name='push-send-lunch'),
    path('notifications/', MyNotificationsView.as_view(), name='my-notifications'),
    path('notifications/mark-read/', MarkNotificationsReadView.as_view(), name='mark-notifications-read'),
    path('appraisals/create/', AppraisalCreateView.as_view(), name='appraisal-create'),
    path('appraisals/mine/', MyAppraisalsView.as_view(), name='my-appraisals'),
]