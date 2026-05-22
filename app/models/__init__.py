"""SQLAlchemy models for Atkly."""

from datetime import datetime

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

# Sentinel values used when a scouting step is not recorded
GENERIC_FIRST_TOUCH = "generic"
GENERIC_SETTER_NAME = "Generic Setter"


class Player(db.Model):
    __tablename__ = "players"

    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.Integer, nullable=False)
    surname = db.Column(db.String(64), nullable=False)
    name = db.Column(db.String(64), nullable=False)
    role = db.Column(db.String(32), nullable=False)
    height = db.Column(db.Integer)  # centimetres

    attacks_as_attacker = db.relationship(
        "Attack", foreign_keys="Attack.attacker_id", backref="attacker", lazy=True
    )
    attacks_as_setter = db.relationship(
        "Attack", foreign_keys="Attack.setter_id", backref="setter", lazy=True
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "number": self.number,
            "surname": self.surname,
            "name": self.name,
            "role": self.role,
            "height": self.height,
        }


class Attack(db.Model):
    __tablename__ = "attacks"

    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    attacker_id = db.Column(db.Integer, db.ForeignKey("players.id"), nullable=False)
    setter_id = db.Column(db.Integer, db.ForeignKey("players.id"), nullable=True)
    setter_generic = db.Column(db.Boolean, default=False)  # True when setter is not on the roster

    rotation = db.Column(db.Integer)    # 1–6
    attack_zone = db.Column(db.Integer) # auto-detected from contact coordinates

    first_touch_type = db.Column(db.String(16))  # # | + | ! | - | generic
    first_touch_generic = db.Column(db.Boolean, default=False)
    set_speed = db.Column(db.String(16))          # quick | medium | high
    attack_type = db.Column(db.String(16))        # power | tip | roll shot | line | cross | seam

    # Result flags — at most one should be True; none means the ball stayed in play
    kill = db.Column(db.Boolean, default=False)
    blocked = db.Column(db.Boolean, default=False)
    out = db.Column(db.Boolean, default=False)
    block_out = db.Column(db.Boolean, default=False)

    notes = db.Column(db.Text)

    # Normalized [0, 1] court coordinates
    reception_x = db.Column(db.Float)
    reception_y = db.Column(db.Float)
    set_x = db.Column(db.Float)
    set_y = db.Column(db.Float)
    approach_start_x = db.Column(db.Float)
    approach_start_y = db.Column(db.Float)
    approach_generic = db.Column(db.Boolean, default=False)
    contact_x = db.Column(db.Float)
    contact_y = db.Column(db.Float)
    trajectory_end_x = db.Column(db.Float)
    trajectory_end_y = db.Column(db.Float)

    # Optional video reference
    video_url = db.Column(db.String(512))
    video_timestamp = db.Column(db.Float)  # seconds

    @property
    def result(self) -> str:
        if self.kill:
            return "kill"
        if self.blocked:
            return "blocked"
        if self.block_out:
            return "block-out"
        if self.out:
            return "out"
        return "play"

    @property
    def is_error(self) -> bool:
        return bool(self.blocked or self.block_out or self.out)

    def to_dict(self) -> dict:
        if self.setter_generic:
            setter_name = GENERIC_SETTER_NAME
        else:
            setter_name = f"{self.setter.surname} #{self.setter.number}" if self.setter else ""

        return {
            "id": self.id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "attacker_id": self.attacker_id,
            "setter_id": self.setter_id,
            "setter_generic": bool(self.setter_generic),
            "attacker_name": f"{self.attacker.surname} #{self.attacker.number}" if self.attacker else "",
            "setter_name": setter_name,
            "rotation": self.rotation,
            "attack_zone": self.attack_zone,
            "first_touch_type": self.first_touch_type,
            "first_touch_generic": bool(self.first_touch_generic),
            "approach_generic": bool(self.approach_generic),
            "set_speed": self.set_speed,
            "attack_type": self.attack_type,
            "kill": bool(self.kill),
            "blocked": bool(self.blocked),
            "block_out": bool(self.block_out),
            "out": bool(self.out),
            "result": self.result,
            "is_error": self.is_error,
            "notes": self.notes,
            "reception_x": self.reception_x,
            "reception_y": self.reception_y,
            "set_x": self.set_x,
            "set_y": self.set_y,
            "approach_start_x": self.approach_start_x,
            "approach_start_y": self.approach_start_y,
            "contact_x": self.contact_x,
            "contact_y": self.contact_y,
            "trajectory_end_x": self.trajectory_end_x,
            "trajectory_end_y": self.trajectory_end_y,
            "video_url": self.video_url,
            "video_timestamp": self.video_timestamp,
        }
