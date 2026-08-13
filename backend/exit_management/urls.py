from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ResignationViewSet,
    ClearanceChecklistItemViewSet,
    ExitInterviewViewSet
)

router = DefaultRouter()
router.register(r'resignations', ResignationViewSet, basename='resignation')
router.register(r'clearance-items', ClearanceChecklistItemViewSet, basename='clearancechecklistitem')
router.register(r'exit-interviews', ExitInterviewViewSet, basename='exitinterview')

urlpatterns = [
    path('', include(router.urls)),
]
