from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    LeaveTypeViewSet,
    LeaveBalanceViewSet,
    LeaveApplicationViewSet,
    HolidayViewSet
)

router = DefaultRouter()
router.register(r'types', LeaveTypeViewSet, basename='leavetype')
router.register(r'balances', LeaveBalanceViewSet, basename='leavebalance')
router.register(r'applications', LeaveApplicationViewSet, basename='leaveapplication')
router.register(r'holidays', HolidayViewSet, basename='holiday')

urlpatterns = [
    path('', include(router.urls)),
]
