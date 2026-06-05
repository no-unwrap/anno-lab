from __future__ import annotations

import os
from urllib.parse import parse_qs, unquote, urlparse

TRUTHY_VALUES = {"1", "true", "yes", "on"}


def env_flag(name: str, default: str = "0", environ: dict[str, str] | None = None) -> bool:
    value = (environ or os.environ).get(name, default)
    return str(value).strip().lower() in TRUTHY_VALUES


def env_csv(name: str, default: str = "", environ: dict[str, str] | None = None) -> list[str]:
    value = (environ or os.environ).get(name, default)
    return [item.strip() for item in str(value).split(",") if item.strip()]


def _postgres_settings_from_env(environ: dict[str, str]) -> dict[str, str]:
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": environ.get("POSTGRES_DB", "anno_lab"),
        "USER": environ.get("POSTGRES_USER", "anno_lab"),
        "PASSWORD": environ.get("POSTGRES_PASSWORD", "anno_lab"),
        "HOST": environ.get("POSTGRES_HOST", "localhost"),
        "PORT": environ.get("POSTGRES_PORT", "5432"),
    }


def database_settings_from_env(environ: dict[str, str] | None = None) -> dict[str, object]:
    env = environ or os.environ
    database_url = env.get("DATABASE_URL", "").strip()
    if not database_url:
        return _postgres_settings_from_env(env)

    parsed = urlparse(database_url)
    scheme = parsed.scheme.lower()

    if scheme.startswith("postgres"):
        config = _postgres_settings_from_env(env)
        name = unquote(parsed.path.lstrip("/"))
        if not name:
            raise ValueError("DATABASE_URL must include a database name.")

        config.update(
            {
                "NAME": name,
                "USER": unquote(parsed.username or config["USER"]),
                "PASSWORD": unquote(parsed.password or config["PASSWORD"]),
                "HOST": parsed.hostname or config["HOST"],
                "PORT": str(parsed.port or config["PORT"]),
            }
        )

        options = {
            key: values[-1]
            for key, values in parse_qs(parsed.query, keep_blank_values=True).items()
            if values
        }
        if options:
            config["OPTIONS"] = options
        return config

    if scheme == "sqlite":
        name = unquote(parsed.path)
        if name == "/:memory:":
            name = ":memory:"
        if not name:
            raise ValueError("SQLite DATABASE_URL must include a database path.")
        return {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": name,
        }

    raise ValueError(f"Unsupported DATABASE_URL scheme: {parsed.scheme}")
