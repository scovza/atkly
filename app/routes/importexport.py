from __future__ import annotations

import csv
import io
import logging
import os
import shutil
import tempfile
from typing import Any

from flask import (
    Blueprint,
    Response,
    current_app,
    jsonify,
    render_template,
    request,
    send_file,
    stream_with_context,
)

from ..models import GENERIC_SETTER_NAME, Attack, Player, db

logger = logging.getLogger(__name__)
importexport_bp = Blueprint("importexport", __name__)

PLAYER_CSV_FIELDS: list[str] = ["id", "number", "surname", "name", "role", "height"]

ATTACK_CSV_FIELDS: list[str] = [
    "id", "created_at",
    "attacker_number", "attacker_surname", "attacker_name",
    "setter_number", "setter_surname", "setter_name", "setter_generic",
    "rotation", "attack_zone",
    "first_touch_type", "first_touch_generic", "set_speed", "attack_type",
    "kill", "blocked", "block_out", "out", "result",
    "reception_x", "reception_y", "set_x", "set_y",
    "approach_start_x", "approach_start_y", "approach_generic",
    "contact_x", "contact_y", "trajectory_end_x", "trajectory_end_y",
    "video_url", "video_timestamp", "notes",
]


@importexport_bp.route("/")
def data_page():
    return render_template("data.html")


@importexport_bp.route("/export/players")
def export_players():
    players = Player.query.order_by(Player.number).all()
    return _csv_response("players_export.csv", PLAYER_CSV_FIELDS, [p.to_dict() for p in players])


@importexport_bp.route("/export/attacks")
def export_attacks():
    attacks = Attack.query.order_by(Attack.created_at).all()
    return _csv_response("attacks_export.csv", ATTACK_CSV_FIELDS, [_attack_to_csv_row(a) for a in attacks])


@importexport_bp.route("/export/db")
def export_db():
    import sqlite3

    db_path = _db_path()
    if not os.path.exists(db_path):
        return jsonify({"error": "Database file not found"}), 404

    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    try:
        src = sqlite3.connect(db_path)
        dst = sqlite3.connect(tmp.name)
        src.backup(dst)
        dst.close()
        src.close()
        return send_file(tmp.name, as_attachment=True, download_name="atkly_backup.db", mimetype="application/octet-stream")
    except Exception as exc:
        logger.exception("DB export failed")
        return jsonify({"error": str(exc)}), 500


@importexport_bp.route("/import/players", methods=["POST"])
def import_players():
    reader, error = _get_csv_reader_from_request()
    if error:
        return jsonify({"error": error}), 400

    required_cols = {"number", "surname", "name", "role"}
    importer = CsvImporter()

    for i, row in importer.rows(reader):
        missing = required_cols - set(row.keys())
        if missing:
            importer.skip(i, f"missing columns: {sorted(missing)}")
            continue

        number = _parse_int(row.get("number"))
        if number is None:
            importer.skip(i, f"'number' must be an integer, got {row['number']!r}")
            continue

        db.session.add(Player(
            number=number,
            surname=row["surname"].strip(),
            name=row["name"].strip(),
            role=row["role"].strip(),
            height=_parse_int(row.get("height")),
        ))
        importer.count()

    return importer.commit_and_respond()


@importexport_bp.route("/import/attacks", methods=["POST"])
def import_attacks():
    reader, error = _get_csv_reader_from_request()
    if error:
        return jsonify({"error": error}), 400

    player_cache: dict[tuple[int, str], Player] = {
        (p.number, p.surname): p for p in Player.query.all()
    }
    importer = CsvImporter()

    for i, row in importer.rows(reader):
        attacker, err = _resolve_player(row, "attacker", player_cache)
        if err:
            importer.skip(i, err)
            continue

        setter_generic = _parse_bool(row.get("setter_generic"))
        setter: Player | None = None
        if not setter_generic:
            sn = _parse_int(row.get("setter_number"))
            ss = (row.get("setter_surname") or "").strip()
            if sn and ss and ss != GENERIC_SETTER_NAME:
                setter = player_cache.get((sn, ss))

        db.session.add(Attack(
            attacker_id=attacker.id,
            setter_id=setter.id if setter else None,
            setter_generic=setter_generic,
            rotation=_parse_int(row.get("rotation")),
            attack_zone=_parse_int(row.get("attack_zone")),
            first_touch_type=row.get("first_touch_type") or None,
            first_touch_generic=_parse_bool(row.get("first_touch_generic")),
            set_speed=row.get("set_speed") or None,
            attack_type=row.get("attack_type") or None,
            kill=_parse_bool(row.get("kill")),
            blocked=_parse_bool(row.get("blocked")),
            block_out=_parse_bool(row.get("block_out")),
            out=_parse_bool(row.get("out")),
            approach_generic=_parse_bool(row.get("approach_generic")),
            reception_x=_parse_float(row.get("reception_x")),
            reception_y=_parse_float(row.get("reception_y")),
            set_x=_parse_float(row.get("set_x")),
            set_y=_parse_float(row.get("set_y")),
            approach_start_x=_parse_float(row.get("approach_start_x")),
            approach_start_y=_parse_float(row.get("approach_start_y")),
            contact_x=_parse_float(row.get("contact_x")),
            contact_y=_parse_float(row.get("contact_y")),
            trajectory_end_x=_parse_float(row.get("trajectory_end_x")),
            trajectory_end_y=_parse_float(row.get("trajectory_end_y")),
            video_url=row.get("video_url") or None,
            video_timestamp=_parse_float(row.get("video_timestamp")),
            notes=row.get("notes") or None,
        ))
        importer.count()

    return importer.commit_and_respond()


@importexport_bp.route("/import/db", methods=["POST"])
def import_db():
    import sqlite3

    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    header = file.stream.read(16)
    if not header.startswith(b"SQLite format 3"):
        return jsonify({"error": "Uploaded file does not appear to be a valid SQLite database"}), 400

    file.stream.seek(0)
    db_path = _db_path()
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False, dir=os.path.dirname(db_path))
    try:
        shutil.copyfileobj(file.stream, tmp)
        tmp.close()

        probe = sqlite3.connect(tmp.name)
        probe.execute("SELECT name FROM sqlite_master LIMIT 1")
        probe.close()

        db.engine.dispose()
        shutil.move(tmp.name, db_path)
        db.engine.connect().close()

        return jsonify({"ok": True, "message": "Database imported successfully"})
    except Exception as exc:
        logger.exception("DB import failed")
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
        return jsonify({"error": str(exc)}), 500


class CsvImporter:
    def __init__(self) -> None:
        self._imported = 0
        self._skipped  = 0
        self._errors: list[str] = []

    def rows(self, reader: csv.DictReader):
        for i, row in enumerate(reader, start=2):
            yield i, row

    def count(self) -> None:
        self._imported += 1

    def skip(self, row: int, reason: str) -> None:
        self._skipped += 1
        self._errors.append(f"Row {row}: {reason}")

    def commit_and_respond(self) -> Response:
        try:
            db.session.commit()
        except Exception as exc:
            db.session.rollback()
            logger.exception("DB commit failed during import")
            return jsonify({"error": f"Database error: {exc}"}), 500
        return jsonify({"imported": self._imported, "skipped": self._skipped, "errors": self._errors})


def _db_path() -> str:
    return current_app.config["SQLALCHEMY_DATABASE_URI"].replace("sqlite:///", "")


def _csv_response(filename: str, fieldnames: list[str], rows: list[dict[str, Any]]) -> Response:
    def generate():
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore", lineterminator="\r\n")
        writer.writeheader()
        yield buf.getvalue()
        for row in rows:
            buf.seek(0); buf.truncate()
            writer.writerow(row)
            yield buf.getvalue()

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Type": "text/csv; charset=utf-8",
    }
    return Response(stream_with_context(generate()), headers=headers)


def _get_csv_reader_from_request() -> tuple[csv.DictReader | None, str | None]:
    file = request.files.get("file")
    if not file:
        return None, "No file uploaded"
    try:
        text = file.stream.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        return None, "File must be UTF-8 encoded"
    if not text.strip():
        return None, "Uploaded file is empty"
    return csv.DictReader(io.StringIO(text)), None


def _attack_to_csv_row(attack: Attack) -> dict[str, Any]:
    row = attack.to_dict()
    if attack.attacker:
        row["attacker_number"]  = attack.attacker.number
        row["attacker_surname"] = attack.attacker.surname
        row["attacker_name"]    = attack.attacker.name
    else:
        row["attacker_number"] = row["attacker_surname"] = row["attacker_name"] = ""

    if attack.setter_generic:
        row["setter_number"] = ""
        row["setter_surname"] = GENERIC_SETTER_NAME
        row["setter_name"] = ""
    elif attack.setter:
        row["setter_number"]  = attack.setter.number
        row["setter_surname"] = attack.setter.surname
        row["setter_name"]    = attack.setter.name
    else:
        row["setter_number"] = row["setter_surname"] = row["setter_name"] = ""

    return {k: row.get(k, "") for k in ATTACK_CSV_FIELDS}


def _resolve_player(
    row: dict[str, str], prefix: str, cache: dict[tuple[int, str], Player]
) -> tuple[Player | None, str | None]:
    number  = _parse_int(row.get(f"{prefix}_number"))
    surname = (row.get(f"{prefix}_surname") or "").strip()
    player  = cache.get((number, surname))
    if player is None:
        return None, f"{prefix} #{number} {surname!r} not found in roster"
    return player, None


def _parse_int(value: Any) -> int | None:
    try: return int(value)
    except (TypeError, ValueError): return None


def _parse_float(value: Any) -> float | None:
    try: return float(value)
    except (TypeError, ValueError): return None


def _parse_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("true", "1", "yes")
