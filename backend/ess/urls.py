from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ESSDashboardView,
    ProfileChangeRequestViewSet,
    HRTicketViewSet,
    TicketCommentViewSet
)

router = DefaultRouter()
router.register(r'profile-changes', ProfileChangeRequestViewSet, basename='profilechangerequest')
router.register(r'tickets', HRTicketViewSet, basename='hrticket')
router.register(r'comments', TicketCommentViewSet, basename='ticketcomment')

urlpatterns = [
    path('dashboard/', ESSDashboardView.as_view(), name='ess-dashboard'),
    path('', include(router.urls)),
]
