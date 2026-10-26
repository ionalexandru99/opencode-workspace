import fcntl
import json
import os
from pathlib import Path
import pty
import select
import signal
import struct
import subprocess
import tarfile
import tempfile
import termios
import time
import unittest


ROOT = Path(__file__).resolve().parent.parent


class PackageInstall(unittest.TestCase):
    def test_git_install_renders_inbox(self):
        subprocess.run(["npm", "run", "check:bundle"], cwd=ROOT, check=True)
        with tempfile.TemporaryDirectory(dir=os.environ.get("OPENCODE_TEST_TMPDIR")) as temporary:
            directory = Path(temporary)
            package = json.loads(subprocess.check_output(
                ["npm", "pack", "--ignore-scripts", "--json", "--pack-destination", str(directory)], cwd=ROOT, text=True,
            ))[0]
            with tarfile.open(directory / package["filename"]) as archive:
                archive.extractall(directory)
            repository = directory / "package"
            for command in (
                ["git", "init", "-b", "experimental/install-test"],
                ["git", "add", "."],
                [
                    "git", "-c", "user.name=Install test", "-c", "user.email=test@example.invalid",
                    "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null",
                    "commit", "-m", "Package fixture",
                ],
            ):
                subprocess.run(command, cwd=repository, check=True, capture_output=True, timeout=30)
            environment = {
                key: value for key, value in os.environ.items()
                if not key.startswith("OPENCODE_")
            }
            environment.update({
                "XDG_CONFIG_HOME": str(directory / "config"),
                "XDG_DATA_HOME": str(directory / "data"),
                "XDG_STATE_HOME": str(directory / "state"),
                "XDG_CACHE_HOME": str(directory / "cache"),
                "TERM": "xterm-256color",
            })
            installed = subprocess.run(
                ["opencode", "plugin", "add", "git+" + repository.as_uri()],
                cwd=directory, env=environment, capture_output=True, text=True, timeout=90,
            )
            install_logs = "\n".join(path.read_text() for path in directory.rglob("*-debug-*.log"))
            self.assertEqual(installed.returncode, 0, installed.stdout + installed.stderr + install_logs)
            subprocess.run(
                ["opencode", "api", "--standalone", "post", "/api/session", "--data", '{"title":"Inbox package fixture"}'],
                cwd=directory, env=environment, check=True, capture_output=True, timeout=30,
            )
            session = json.loads(subprocess.check_output(
                ["opencode", "api", "--standalone", "post", "/api/session", "--data", '{"title":"Install test"}'],
                cwd=directory, env=environment, text=True, timeout=30,
            ))["data"]
            master, slave = pty.openpty()
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 50, 180, 0, 0))
            process = subprocess.Popen(
                ["opencode", "--standalone", "--log-level", "debug", "--session", session["id"]],
                cwd=directory, env=environment, stdin=slave, stdout=slave, stderr=slave, start_new_session=True,
            )
            os.close(slave)
            output = bytearray()
            try:
                deadline = time.monotonic() + 15
                while process.poll() is None and time.monotonic() < deadline:
                    if select.select([master], [], [], 0.2)[0]:
                        try:
                            output.extend(os.read(master, 65536))
                        except OSError:
                            break
                    if b"Inbox package fixture" in output:
                        break
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                deadline = time.monotonic() + 5
                while process.poll() is None and time.monotonic() < deadline:
                    if select.select([master], [], [], 0.2)[0]:
                        try:
                            output.extend(os.read(master, 65536))
                        except OSError:
                            break
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
                os.close(master)
            logs = "\n".join(path.read_text() for path in (directory / "data").rglob("opencode.log"))
            failures = [line for line in logs.splitlines() if 'message="plugin operation failed"' in line]
            self.assertEqual(failures, [], "\n".join(failures))
            diagnostics = "\n".join(line for line in logs.splitlines() if "level=WARN" in line or "level=ERROR" in line)
            self.assertTrue(b"Inbox package fixture" in output, "Inbox did not render the other session.\n" + diagnostics)


if __name__ == "__main__":
    unittest.main()
