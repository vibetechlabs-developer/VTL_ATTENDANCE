from django.urls import path
from .views import (
    CheckInView, CheckOutView,
    BreakStartView, BreakEndView,
    CallStartView, CallEndView,
    FaceRegisterView,
    MyAttendanceHistoryView,
    MyAttendanceSessionView,
    OvertimeNotifyView,
    AdminAttendanceView,
    AdminAttendanceOverviewView,
    AdminForceCheckOutView,
    AdminEmployeeAttendanceHistoryView,
)

urlpatterns = [
    path('check-in/', CheckInView.as_view(), name='check-in'),
    path('check-out/', CheckOutView.as_view(), name='check-out'),
    path('session/', MyAttendanceSessionView.as_view(), name='attendance-session'),
    path('overtime-notify/', OvertimeNotifyView.as_view(), name='attendance-overtime-notify'),
    path('history/', MyAttendanceHistoryView.as_view(), name='attendance-history'),
    path('admin/', AdminAttendanceView.as_view(), name='attendance-admin'),
    path('admin/overview/', AdminAttendanceOverviewView.as_view(), name='attendance-admin-overview'),
    path('overview/', AdminAttendanceOverviewView.as_view(), name='attendance-overview-short'),
    path('admin/force-checkout/', AdminForceCheckOutView.as_view(), name='attendance-admin-force-checkout'),
    path('admin/history/', AdminEmployeeAttendanceHistoryView.as_view(), name='attendance-admin-history'),
    path('break/start/', BreakStartView.as_view(), name='break-start'),
    path('break/end/', BreakEndView.as_view(), name='break-end'),
    path('call/start/', CallStartView.as_view(), name='call-start'),
    path('call/end/', CallEndView.as_view(), name='call-end'),
    path('register-face/', FaceRegisterView.as_view(), name='register-face'),
]