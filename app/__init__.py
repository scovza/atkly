import json
import logging
import os

from flask import Flask, g, session

from .models import db
from .routes.analytics import analytics_bp
from .routes.attacks import attacks_bp
from .routes.importexport import importexport_bp
from .routes.main import main_bp
from .routes.players import players_bp

logger = logging.getLogger(__name__)

SUPPORTED_LANGS = ("en", "it")
DEFAULT_LANG    = "en"

_locale_cache: dict = {}


def _load_locale(lang: str) -> dict:
    if lang not in _locale_cache:
        path = os.path.join(os.path.dirname(__file__), "..", "locales", f"{lang}.json")
        with open(path, encoding="utf-8") as f:
            _locale_cache[lang] = json.load(f)
    return _locale_cache[lang]


def create_app(config: dict | None = None) -> Flask:
    app = Flask(__name__, instance_relative_config=True)

    db_path = os.path.join(app.instance_path, "database.db")
    app.config.update(
        SECRET_KEY="atkly-local-key",
        SQLALCHEMY_DATABASE_URI=f"sqlite:///{db_path}",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )
    if config:
        app.config.update(config)

    os.makedirs(app.instance_path, exist_ok=True)
    db.init_app(app)

    for blueprint, prefix in [
        (main_bp,        None),
        (players_bp,     "/players"),
        (attacks_bp,     "/attacks"),
        (analytics_bp,   "/analytics"),
        (importexport_bp, "/data"),
    ]:
        app.register_blueprint(blueprint, url_prefix=prefix)

    with app.app_context():
        db.create_all()
        _run_migrations()

    @app.before_request
    def _set_locale():
        lang = session.get("lang", DEFAULT_LANG)
        if lang not in SUPPORTED_LANGS:
            lang = DEFAULT_LANG
        g.lang = lang
        g.t    = _load_locale(lang)

    @app.context_processor
    def _inject_locale():
        return {"t": g.t, "lang": g.lang}

    @app.route("/set-lang/<lang>")
    def set_lang(lang):
        from flask import redirect, request
        if lang in SUPPORTED_LANGS:
            session["lang"] = lang
        return redirect(request.referrer or "/")

    return app


def _run_migrations() -> None:
    from sqlalchemy import text

    pending_columns = [
        ("attacks", "setter_generic",      "BOOLEAN DEFAULT 0"),
        ("attacks", "out",                 "BOOLEAN DEFAULT 0"),
        ("attacks", "first_touch_generic", "BOOLEAN DEFAULT 0"),
        ("attacks", "approach_generic",    "BOOLEAN DEFAULT 0"),
        ("attacks", "block_out",           "BOOLEAN DEFAULT 0"),
    ]

    with db.engine.connect() as conn:
        for table, column, definition in pending_columns:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
                conn.commit()
            except Exception:
                pass
