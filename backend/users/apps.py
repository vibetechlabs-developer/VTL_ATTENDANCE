from django.apps import AppConfig


class UsersConfig(AppConfig):
    default = True
    name = 'users'

    def ready(self):
        import users.signals  # noqa

