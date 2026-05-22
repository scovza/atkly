"""launcher.py — start Atkly and open it in the default browser.

Usage
-----
    python launcher.py          # development (subprocess mode)
    ./atkly                     # PyInstaller release build (thread mode)

How it works
------------
Development (not frozen):
    Flask is spawned as a subprocess using the same Python interpreter.
    stdout/stderr from the server are forwarded to the terminal.

Frozen / PyInstaller build:
    sys.executable is the compiled binary, not a Python interpreter, so
    subprocess mode won't work. Flask runs in a background daemon thread
    inside the same process instead.
"""

import logging
import os
import signal
import socket
import sys
import threading
import time
import webbrowser

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("launcher")

STARTUP_TIMEOUT = 30  # seconds to wait for the server to respond


# ---------------------------------------------------------------------------
# Port utilities
# ---------------------------------------------------------------------------

def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return s.getsockname()[1]


def wait_for_server(port: int, timeout: int = STARTUP_TIMEOUT) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return True
        except OSError:
            time.sleep(0.25)
    return False


# ---------------------------------------------------------------------------
# Launch strategies
# ---------------------------------------------------------------------------

def _run_flask_in_thread(port: int) -> None:
    """Run the Flask dev server in a daemon thread (frozen build only)."""
    from app import create_app

    app = create_app()
    # The Werkzeug reloader must be disabled when running inside a thread.
    app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False)


def _spawn_flask_subprocess(port: int):
    """Spawn run.py as a child process (development mode)."""
    import subprocess

    here = os.path.dirname(os.path.abspath(__file__))
    env = {**os.environ, "FLASK_RUN_PORT": str(port)}

    proc = subprocess.Popen(
        [sys.executable, "run.py"],
        cwd=here,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    log.info("Started server subprocess (pid %d)", proc.pid)
    return proc


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main() -> None:
    port = find_free_port()
    log.info("Starting Atkly on port %d…", port)

    frozen = getattr(sys, "frozen", False)  # True when running as a PyInstaller bundle

    if frozen:
        t = threading.Thread(target=_run_flask_in_thread, args=(port,), daemon=True)
        t.start()

        if not wait_for_server(port):
            log.error("Server did not become ready within %d seconds.", STARTUP_TIMEOUT)
            sys.exit(1)

        url = f"http://127.0.0.1:{port}/"
        log.info("Opening %s", url)
        webbrowser.open(url)
        log.info("Atkly is running. Close this window to stop.")

        try:
            t.join()
        except KeyboardInterrupt:
            log.info("Shutting down.")
            sys.exit(0)

    else:
        server = _spawn_flask_subprocess(port)

        if not wait_for_server(port):
            output = server.stdout.read().decode(errors="replace")
            log.error(
                "Server did not start within %d seconds.\n%s",
                STARTUP_TIMEOUT,
                output,
            )
            server.terminate()
            sys.exit(1)

        url = f"http://127.0.0.1:{port}/"
        log.info("Opening %s", url)
        webbrowser.open(url)

        def _shutdown(signum=None, frame=None):
            log.info("Shutting down…")
            server.terminate()
            try:
                server.wait(timeout=5)
            except Exception:
                server.kill()
            sys.exit(0)

        signal.signal(signal.SIGINT, _shutdown)
        signal.signal(signal.SIGTERM, _shutdown)
        log.info("Atkly is running. Press Ctrl+C to stop.")

        def _drain_output():
            for line in server.stdout:
                log.info("[server] %s", line.decode(errors="replace").rstrip())

        threading.Thread(target=_drain_output, daemon=True).start()

        try:
            server.wait()
        except KeyboardInterrupt:
            _shutdown()


if __name__ == "__main__":
    main()
