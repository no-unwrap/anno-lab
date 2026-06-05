from __future__ import annotations

from pathlib import Path

from anno_lab.settings_helpers import database_settings_from_env, env_csv, env_flag


def test_database_settings_from_env_prefers_database_url() -> None:
    config = database_settings_from_env(
        {
            "DATABASE_URL": "postgres://ivc_user:secret@example.com:6543/ivc_prod"
            "?sslmode=require"
        }
    )

    assert config == {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "ivc_prod",
        "USER": "ivc_user",
        "PASSWORD": "secret",
        "HOST": "example.com",
        "PORT": "6543",
        "OPTIONS": {"sslmode": "require"},
    }


def test_database_settings_from_env_uses_postgres_fallbacks_without_database_url() -> None:
    config = database_settings_from_env(
        {
            "POSTGRES_DB": "ivc_local",
            "POSTGRES_USER": "local_user",
            "POSTGRES_PASSWORD": "local_pass",
            "POSTGRES_HOST": "db",
            "POSTGRES_PORT": "5439",
        }
    )

    assert config == {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "ivc_local",
        "USER": "local_user",
        "PASSWORD": "local_pass",
        "HOST": "db",
        "PORT": "5439",
    }


def test_database_settings_from_env_uses_neutral_defaults() -> None:
    config = database_settings_from_env({"UNRELATED_ENV": "1"})

    assert config == {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "anno_lab",
        "USER": "anno_lab",
        "PASSWORD": "anno_lab",
        "HOST": "localhost",
        "PORT": "5432",
    }


def test_env_helpers_parse_flags_and_csv_values() -> None:
    environ = {
        "CORS_ALLOW_ALL_ORIGINS": "true",
        "CORS_ALLOWED_ORIGINS": "https://one.example, https://two.example ,,",
    }

    assert env_flag("CORS_ALLOW_ALL_ORIGINS", environ=environ)
    assert env_csv("CORS_ALLOWED_ORIGINS", environ=environ) == [
        "https://one.example",
        "https://two.example",
    ]


def test_render_blueprint_uses_a_single_services_block() -> None:
    content = Path("render.yaml").read_text(encoding="utf-8")

    assert sum(1 for line in content.splitlines() if line.strip() == "services:") == 1
    assert "name: anno-lab-web" in content
    assert "name: anno-lab-worker" in content
    assert "name: anno-lab-beat" in content
    assert "name: anno-lab-redis" in content
