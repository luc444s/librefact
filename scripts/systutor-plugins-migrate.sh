#!/bin/bash
set -euo pipefail

if [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  . .venv/bin/activate
else
  echo "Falta .venv — ejecuta primero el instalador" >&2
  exit 1
fi

export SYSTUTOR_DATABASE_URL="${SYSTUTOR_DATABASE_URL:-postgresql+psycopg://postgres:postgres@localhost:5432/librefact}"
export SYSTUTOR_PLUGINS_DIR="${SYSTUTOR_PLUGINS_DIR:-$PWD/plugins}"
export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}$PWD"

cd vendor/systutor-core

python3 - <<'PY'
from pathlib import Path
from uuid import uuid4

from sqlalchemy import text

from systutor.core.config import get_settings
from systutor.core.database import build_session_factory
from systutor.kernel.plugins.persistent import sync_plugin_registry_state, upgrade_plugin
from systutor.kernel.plugins.runtime import PluginManifestRegistry

selected_plugins = ("crm", "productos", "compras", "ventas", "stock", "configuracion")
settings = get_settings()
registry = PluginManifestRegistry(Path(settings.plugins_dir))
registry.discover()
session_factory = build_session_factory(settings)

with session_factory() as session:
    sync_plugin_registry_state(session, registry=registry)
    records = session.execute(text("SELECT plugin_id FROM plugin_registry")).all()
    known = {record.plugin_id for record in records}
    missing = [plugin_id for plugin_id in selected_plugins if plugin_id not in known]
    if missing:
        raise SystemExit(f"Plugins no encontrados: {', '.join(missing)}")

    granted_permissions = []
    for plugin_id in selected_plugins:
        record = upgrade_plugin(session, registry=registry, plugin_id=plugin_id)
        granted_permissions.extend(record.permissions_json)
        print(f"[systutor] plugin {record.plugin_id}: {record.state} migration={record.migration_version}")

    tenant = session.scalar(text("SELECT id FROM tenants WHERE slug = :slug"), {"slug": settings.seed_demo_tenant_slug})
    if tenant is not None:
        admin_role = session.scalar(
            text("SELECT id FROM roles WHERE tenant_id = :tenant_id AND name = 'admin'"),
            {"tenant_id": tenant},
        )
        if admin_role is not None:
            for permission_name in sorted(set(granted_permissions)):
                permission = session.scalar(
                    text("SELECT id FROM permissions WHERE name = :name"),
                    {"name": permission_name},
                )
                if permission is None:
                    continue
                session.execute(
                    text(
                        """
                        INSERT INTO role_permissions (id, role_id, permission_id, created_at)
                        VALUES (:id, :role_id, :permission_id, NOW())
                        ON CONFLICT DO NOTHING
                        """
                    ),
                    {"id": str(uuid4()), "role_id": admin_role, "permission_id": permission},
                )
    session.commit()
PY
