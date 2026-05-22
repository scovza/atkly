from flask import Blueprint, jsonify, render_template, request

from ..models import GENERIC_SETTER_NAME, Attack, Player, db

analytics_bp = Blueprint("analytics", __name__)


def _apply_filters(query, args):
    if args.get("attacker_id"):
        query = query.filter(Attack.attacker_id == int(args["attacker_id"]))

    if args.get("setter_id"):
        sid = args["setter_id"]
        if sid == "generic":
            query = query.filter(Attack.setter_generic == True)
        else:
            query = query.filter(Attack.setter_id == int(sid))

    if args.get("rotation"):
        query = query.filter(Attack.rotation == int(args["rotation"]))
    if args.get("first_touch_type"):
        query = query.filter(Attack.first_touch_type == args["first_touch_type"])
    if args.get("set_speed"):
        query = query.filter(Attack.set_speed == args["set_speed"])
    if args.get("attack_type"):
        query = query.filter(Attack.attack_type == args["attack_type"])
    if args.get("attack_zone"):
        query = query.filter(Attack.attack_zone == int(args["attack_zone"]))

    result = args.get("result")
    if result == "kill":
        query = query.filter(Attack.kill == True)
    elif result == "blocked":
        query = query.filter(Attack.blocked == True)
    elif result == "block-out":
        query = query.filter(Attack.block_out == True)
    elif result == "out":
        query = query.filter(Attack.out == True)
    elif result == "play":
        query = query.filter(
            Attack.kill == False,
            Attack.blocked == False,
            Attack.block_out == False,
            Attack.out == False,
        )
    elif args.get("kill") not in (None, ""):
        query = query.filter(Attack.kill == (args["kill"] == "true"))

    return query


@analytics_bp.route("/")
def analytics_page():
    return render_template("analytics.html")


@analytics_bp.route("/stats")
def stats():
    attacks = _apply_filters(Attack.query, request.args).all()
    total = len(attacks)
    if total == 0:
        return jsonify({"total": 0})

    kills     = sum(1 for a in attacks if a.kill)
    blocked   = sum(1 for a in attacks if a.blocked)
    block_outs = sum(1 for a in attacks if a.block_out)
    outs      = sum(1 for a in attacks if a.out)
    plays     = sum(1 for a in attacks if a.result == "play")
    errors    = sum(1 for a in attacks if a.is_error)

    zone_dist = _count_by(attacks, lambda a: str(a.attack_zone or "?"))
    type_dist = _count_by(attacks, lambda a: a.attack_type or "unknown")

    ft_count: dict = {}
    ft_kills: dict = {}
    for a in attacks:
        ft = a.first_touch_type or "unknown"
        ft_count[ft] = ft_count.get(ft, 0) + 1
        if a.kill:
            ft_kills[ft] = ft_kills.get(ft, 0) + 1
    ft_stats = {ft: {"count": ft_count[ft], "kills": ft_kills.get(ft, 0)} for ft in ft_count}

    return jsonify({
        "total": total,
        "kills": kills,
        "kill_pct": _pct(kills, total),
        "blocked": blocked,
        "block_pct": _pct(blocked, total),
        "block_out": block_outs,
        "block_out_pct": _pct(block_outs, total),
        "out": outs,
        "out_pct": _pct(outs, total),
        "play": plays,
        "play_pct": _pct(plays, total),
        "errors": errors,
        "error_pct": _pct(errors, total),
        "zone_distribution": zone_dist,
        "type_distribution": type_dist,
        "first_touch_stats": ft_stats,
    })


@analytics_bp.route("/heatmap")
def heatmap_data():
    attacks = (
        _apply_filters(Attack.query, request.args)
        .filter(Attack.trajectory_end_x != None)
        .all()
    )
    return jsonify([
        {"x": a.trajectory_end_x, "y": a.trajectory_end_y, "result": a.result}
        for a in attacks
    ])


@analytics_bp.route("/trajectories")
def trajectories():
    attacks = (
        _apply_filters(Attack.query, request.args)
        .filter(Attack.contact_x != None, Attack.trajectory_end_x != None)
        .all()
    )
    return jsonify([a.to_dict() for a in attacks])


@analytics_bp.route("/setter-distribution")
def setter_distribution():
    result = []

    for setter in Player.query.filter_by(role="Setter").all():
        attacks = Attack.query.filter_by(setter_id=setter.id).all()
        if not attacks:
            continue
        result.append(_setter_bucket(
            setter_id=setter.id,
            setter_name=f"{setter.surname} #{setter.number}",
            attacks=attacks,
        ))

    generic_attacks = Attack.query.filter_by(setter_generic=True).all()
    if generic_attacks:
        result.append(_setter_bucket(
            setter_id="generic",
            setter_name=GENERIC_SETTER_NAME,
            attacks=generic_attacks,
        ))

    return jsonify(result)


def _pct(part: int, total: int) -> float:
    return round(part / total * 100, 1) if total else 0.0


def _count_by(items, key_fn) -> dict:
    counts: dict = {}
    for item in items:
        k = key_fn(item)
        counts[k] = counts.get(k, 0) + 1
    return counts


def _setter_bucket(setter_id, setter_name: str, attacks: list) -> dict:
    return {
        "setter_id": setter_id,
        "setter_name": setter_name,
        "total_sets": len(attacks),
        "attacker_distribution": _count_by(
            attacks,
            lambda a: f"{a.attacker.surname} #{a.attacker.number}" if a.attacker else "?",
        ),
        "zone_distribution": _count_by(attacks, lambda a: str(a.attack_zone or "?")),
    }
