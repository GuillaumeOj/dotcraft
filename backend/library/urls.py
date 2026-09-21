from django.urls import path

from library import views

urlpatterns = [
    path("sync/", views.SyncView.as_view(), name="sync"),
    path("documents/<uuid:document_id>/logo/", views.DocumentLogoView.as_view(), name="document-logo"),
]
