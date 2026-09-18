import uuid

from django.db import models


class UUIDModel(models.Model):
    """Abstract base giving every model a UUID primary key."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True
