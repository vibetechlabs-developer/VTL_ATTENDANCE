from django.conf import settings
from django.conf.urls.static import static
import os
from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from attendance.views import AdminAttendanceOverviewView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/core/', include('core.urls')),
    path('api/sysadmin/', include('sysadmin.urls')),
    path('api/users/', include('users.urls')),
    path('api/attendance/', include('attendance.urls')),
    path('api/leaves/', include('leaves.urls')),
    path('api/leave/', include('leave.urls')),
    path('api/payroll/', include('payroll.urls')),
    path('api/recruitment/', include('recruitment.urls')),
    path('api/performance/', include('performance.urls')),
    path('api/ess/', include('ess.urls')),
    path('api/documents/', include('documents.urls')),
    path('api/training/', include('training.urls')),
    path('api/exit-management/', include('exit_management.urls')),
    path('api/exit_management/', include('exit_management.urls')),
    path('api/updates/', include('updates.urls')),
    # Legacy / misconfigured production frontends may call these paths directly.
    path('overview/', AdminAttendanceOverviewView.as_view(), name='attendance-overview-root-alias'),
    path('api/overview/', AdminAttendanceOverviewView.as_view(), name='attendance-overview-api-root-alias'),
]

# Serve uploaded media in local/dev environments.
# By default, this project only serves /media/ when DEBUG=true.
# If you run local with DEBUG=false, set: SERVE_MEDIA=1
_serve_media = os.getenv("SERVE_MEDIA", "").strip().lower() in ["1", "true", "yes", "y"]
if settings.DEBUG or _serve_media:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)