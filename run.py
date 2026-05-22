"""run.py — direct Flask entry point.

Intended for development or for use as a subprocess target from launcher.py.
For interactive development, prefer launcher.py which also opens the browser.
"""

import os

from app import create_app

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("FLASK_RUN_PORT", 5000))
    app.run(debug=False, host="127.0.0.1", port=port)
