from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DailyUpdateView, TaskViewSet

router = DefaultRouter()
router.register(r'tasks', TaskViewSet, basename='task')

urlpatterns = [
    path('', DailyUpdateView.as_view(), name='daily-update'),
    path('', include(router.urls)),
]