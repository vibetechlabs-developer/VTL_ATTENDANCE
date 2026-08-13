from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PolicyDocumentViewSet,
    LetterTemplateViewSet,
    GeneratedLetterViewSet
)

router = DefaultRouter()
router.register(r'policies', PolicyDocumentViewSet, basename='policydocument')
router.register(r'templates', LetterTemplateViewSet, basename='lettertemplate')
router.register(r'letters', GeneratedLetterViewSet, basename='generatedletter')

urlpatterns = [
    path('', include(router.urls)),
]
