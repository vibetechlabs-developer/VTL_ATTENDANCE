from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TrainingProgramViewSet, TrainingEnrollmentViewSet

router = DefaultRouter()
router.register(r'programs', TrainingProgramViewSet, basename='trainingprogram')
router.register(r'enrollments', TrainingEnrollmentViewSet, basename='trainingenrollment')

urlpatterns = [
    path('', include(router.urls)),
]
