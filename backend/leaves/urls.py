from django.urls import path
from .views import (
    LeaveApplyView, LeaveApproveView,
    LeaveRejectView, LeaveBalanceView,
    LeaveHistoryView, PendingLeavesView, LeaveUsageSummaryView
)

urlpatterns = [
    path('apply/', LeaveApplyView.as_view(), name='leave-apply'),
    path('<int:pk>/approve/', LeaveApproveView.as_view(), name='leave-approve'),
    path('<int:pk>/reject/', LeaveRejectView.as_view(), name='leave-reject'),
    path('balance/', LeaveBalanceView.as_view(), name='leave-balance'),
    path('history/', LeaveHistoryView.as_view(), name='leave-history'),
    path('pending/', PendingLeavesView.as_view(), name='leave-pending'),
    path('summary/', LeaveUsageSummaryView.as_view(), name='leave-summary'),
]