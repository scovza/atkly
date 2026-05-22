"""
Court coordinate utilities.

Coordinate space (normalized 0–1):
  x  — court width,  0 = left,  1 = right
  y  — court height, 0 = top (far end), 1 = bottom (our end)

Free-zone margins:
  FZ_X = 0.20  (left/right)
  FZ_Y = 0.125 (top/bottom)

Our attack half: y ∈ [0.5, COURT_BOTTOM]

FIVB zone layout (attack half, front row nearest the net):
  Zone 4 | Zone 3 | Zone 2   (front row)
  Zone 5 | Zone 6 | Zone 1   (back row)
"""

# Free-zone fractions — must match the constants in court.js
FZ_X = 0.200
FZ_Y = 0.125

COURT_LEFT = FZ_X
COURT_RIGHT = 1.0 - FZ_X
COURT_TOP = FZ_Y
COURT_BOTTOM = 1.0 - FZ_Y

# Our half (attack side): from the net to our back line
OUR_TOP = 0.5
OUR_BOTTOM = COURT_BOTTOM

# Zone map: (x_min, x_max, y_min, y_max, zone) in court-relative [0, 1] space
_ZONE_MAP = [
    (0.00, 0.33, 0.00, 0.33, 4),
    (0.33, 0.67, 0.00, 0.33, 3),
    (0.67, 1.00, 0.00, 0.33, 2),
    (0.00, 0.33, 0.33, 1.00, 5),
    (0.33, 0.67, 0.33, 1.00, 6),
    (0.67, 1.00, 0.33, 1.00, 1),
]


def detect_zone(x: float | None, y: float | None) -> int | None:
    """Return the FIVB volleyball zone (1–6) for total-area normalized coordinates.

    Returns None if the coordinates are missing or fall outside our half of the court.
    """
    if x is None or y is None:
        return None

    court_w = COURT_RIGHT - COURT_LEFT
    half_h = OUR_BOTTOM - OUR_TOP

    # Convert to court-relative coordinates within our half
    cx = (x - COURT_LEFT) / court_w
    cy = (y - OUR_TOP) / half_h

    for x_min, x_max, y_min, y_max, zone in _ZONE_MAP:
        if x_min <= cx <= x_max and y_min <= cy <= y_max:
            return zone

    return None  # outside court or in the free zone


def is_out_of_court(x: float | None, y: float | None) -> bool:
    """Return True if the coordinates fall outside the 9 × 9 m court area."""
    if x is None or y is None:
        return False
    return not (COURT_LEFT <= x <= COURT_RIGHT and COURT_TOP <= y <= COURT_BOTTOM)
