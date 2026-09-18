from django.conf import settings
from django.contrib import admin
from django.urls import include, path

from core.views import health

urlpatterns = [
    path(f"api/{settings.ADMIN_PATH}/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/v1/", include("accounts.urls")),
    path("api/v1/", include("library.urls")),
]
