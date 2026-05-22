from flask import Blueprint, jsonify, request

from ..models import GENERIC_FIRST_TOUCH, Attack, db
from ..utils.court import detect_zone, is_out_of_court

attacks_bp = Blueprint("attacks", __name__)


def _apply_attack_fields(attack: Attack, data: dict) -> None:
    attack.reception_x      = data.get("reception_x")
    attack.reception_y      = data.get("reception_y")
    attack.set_x            = data.get("set_x")
    attack.set_y            = data.get("set_y")
    attack.approach_start_x = data.get("approach_start_x")
    attack.approach_start_y = data.get("approach_start_y")
    attack.contact_x        = data.get("contact_x")
    attack.contact_y        = data.get("contact_y")
    attack.trajectory_end_x = data.get("trajectory_end_x")
    attack.trajectory_end_y = data.get("trajectory_end_y")

    attack.attack_zone = detect_zone(data.get("contact_x"), data.get("contact_y"))
    attack.rotation    = data.get("rotation")
    attack.set_speed   = data.get("set_speed")
    attack.attack_type = data.get("attack_type")

    if data.get("first_touch_generic"):
        attack.first_touch_type    = GENERIC_FIRST_TOUCH
        attack.first_touch_generic = True
    else:
        attack.first_touch_type    = data.get("first_touch_type")
        attack.first_touch_generic = False

    attack.approach_generic = bool(data.get("approach_generic", False))
    attack.setter_generic   = bool(data.get("setter_generic", False))
    attack.setter_id        = None if attack.setter_generic else (data.get("setter_id") or None)

    kill       = bool(data.get("kill", False))
    blocked    = bool(data.get("blocked", False))
    block_out  = bool(data.get("block_out", False))
    out_explicit = bool(data.get("out", False))
    out_auto   = (
        not kill and not blocked and not block_out
        and is_out_of_court(data.get("trajectory_end_x"), data.get("trajectory_end_y"))
    )

    attack.kill      = kill
    attack.blocked   = blocked
    attack.block_out = block_out
    attack.out       = out_explicit or out_auto

    attack.notes           = data.get("notes")
    attack.video_url       = data.get("video_url")
    attack.video_timestamp = data.get("video_timestamp")


@attacks_bp.route("/", methods=["GET"])
def list_attacks():
    attacks = Attack.query.order_by(Attack.created_at.desc()).all()
    return jsonify([a.to_dict() for a in attacks])


@attacks_bp.route("/", methods=["POST"])
def create_attack():
    data = request.get_json()
    attack = Attack(attacker_id=data["attacker_id"])
    _apply_attack_fields(attack, data)
    db.session.add(attack)
    db.session.commit()
    return jsonify(attack.to_dict()), 201


@attacks_bp.route("/<int:attack_id>", methods=["GET"])
def get_attack(attack_id):
    attack = Attack.query.get_or_404(attack_id)
    return jsonify(attack.to_dict())


@attacks_bp.route("/<int:attack_id>", methods=["PATCH"])
def update_attack(attack_id):
    attack = Attack.query.get_or_404(attack_id)
    data = request.get_json()
    if "attacker_id" in data:
        attack.attacker_id = data["attacker_id"]
    _apply_attack_fields(attack, data)
    db.session.commit()
    return jsonify(attack.to_dict())


@attacks_bp.route("/<int:attack_id>", methods=["DELETE"])
def delete_attack(attack_id):
    attack = Attack.query.get_or_404(attack_id)
    db.session.delete(attack)
    db.session.commit()
    return jsonify({"ok": True})
