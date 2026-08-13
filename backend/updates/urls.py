from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DailyUpdateView, DailyUpdateDetailView, TaskViewSet

router = DefaultRouter()
router.register(r'tasks', TaskViewSet, basename='task')

urlpatterns = [
    path('', DailyUpdateView.as_view(), name='daily-update'),
    path('<int:pk>/', DailyUpdateDetailView.as_view(), name='daily-update-detail'),
    path('', include(router.urls)),
]