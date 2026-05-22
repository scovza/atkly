"""Player CRUD routes."""

from flask import Blueprint, jsonify, request

from ..models import Player, db

players_bp = Blueprint("players", __name__)


@players_bp.route("/", methods=["GET"])
def list_players():
    players = Player.query.order_by(Player.number).all()
    return jsonify([p.to_dict() for p in players])


@players_bp.route("/", methods=["POST"])
def create_player():
    data = request.get_json()
    player = Player(
        number=data["number"],
        surname=data["surname"],
        name=data["name"],
        role=data["role"],
        height=data.get("height"),
    )
    db.session.add(player)
    db.session.commit()
    return jsonify(player.to_dict()), 201


@players_bp.route("/<int:player_id>", methods=["PUT"])
def update_player(player_id):
    player = Player.query.get_or_404(player_id)
    data = request.get_json()
    player.number = data.get("number", player.number)
    player.surname = data.get("surname", player.surname)
    player.name = data.get("name", player.name)
    player.role = data.get("role", player.role)
    player.height = data.get("height", player.height)
    db.session.commit()
    return jsonify(player.to_dict())


@players_bp.route("/<int:player_id>", methods=["DELETE"])
def delete_player(player_id):
    player = Player.query.get_or_404(player_id)
    db.session.delete(player)
    db.session.commit()
    return jsonify({"ok": True})
