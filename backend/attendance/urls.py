from django.urls import path
from .views import (
    CheckInView, CheckOutView,
    BreakStartView, BreakEndView,
    FaceRegisterView,
    MyAttendanceHistoryView,
    MyAttendanceSessionView,
    AdminAttendanceView,
    AdminForceCheckOutView,
    AdminEmployeeAttendanceHistoryView,
)

urlpatterns = [
    path('check-in/', CheckInView.as_view(), name='check-in'),
    path('check-out/', CheckOutView.as_view(), name='check-out'),
    path('session/', MyAttendanceSessionView.as_view(), name='attendance-session'),
    path('history/', MyAttendanceHistoryView.as_view(), name='attendance-history'),
    path('admin/', AdminAttendanceView.as_view(), name='attendance-admin'),
    path('admin/force-checkout/', AdminForceCheckOutView.as_view(), name='attendance-admin-force-checkout'),
    path('admin/history/', AdminEmployeeAttendanceHistoryView.as_view(), name='attendance-admin-history'),
    path('break/start/', BreakStartView.as_view(), name='break-start'),
    path('break/end/', BreakEndView.as_view(), name='break-end'),
    path('register-face/', FaceRegisterView.as_view(), name='register-face'),
]