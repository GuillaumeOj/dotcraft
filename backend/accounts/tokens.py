from django.contrib.auth.tokens import PasswordResetTokenGenerator

# The default generator hashes the password and last_login, so a link stops
# working once it has been used or the password changed another way.
password_reset_token = PasswordResetTokenGenerator()
