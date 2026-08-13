from django.core.management.base import BaseCommand

from sysadmin.services.seed_rbac import seed_role_permissions


class Command(BaseCommand):
    help = 'Seed default RoleModulePermission rows for all HRMS modules (SYS-02).'

    def handle(self, *args, **options):
        created, updated = seed_role_permissions()
        self.stdout.write(
            self.style.SUCCESS(
                f'RBAC seed complete: {created} created, {updated} updated.'
            )
        )
