from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AppraisalCycleViewSet,
    GoalViewSet,
    AppraisalViewSet,
    my_appraisal,
    self_assessment,
    team_appraisals,
    finalize_employee_appraisal,
    generate_appraisal_pdf,
)

router = DefaultRouter()
router.register(r'cycles', AppraisalCycleViewSet, basename='appraisalcycle')
router.register(r'goals', GoalViewSet, basename='goal')
router.register(r'appraisals', AppraisalViewSet, basename='appraisal')

urlpatterns = [
    # Employee-facing
    path('my-appraisal/', my_appraisal, name='my-appraisal'),
    path('my-appraisal/self-assessment/', self_assessment, name='self-assessment'),

    # Manager-facing
    path('team-appraisals/', team_appraisals, name='team-appraisals'),
    path('team-appraisals/<int:employee_id>/finalize/', finalize_employee_appraisal, name='finalize-appraisal'),
    path('appraisal/<int:appraisal_id>/pdf/', generate_appraisal_pdf, name='appraisal-pdf'),

    # ViewSet routes (cycles, goals, appraisals, appraisals/<id>/evaluate_factors/, etc.)
    path('', include(router.urls)),
]
