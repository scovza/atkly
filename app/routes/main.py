"""Main / index routes."""

from flask import Blueprint, render_template

main_bp = Blueprint("main", __name__)


@main_bp.route("/")
def index():
    return render_template("home.html")


@main_bp.route("/scout/")
def scout():
    return render_template("scout.html")
