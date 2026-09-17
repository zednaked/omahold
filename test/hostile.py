#!/usr/bin/env python3
# What save.py refuses, run against a throwaway $HOME.
#
#   python3 test/hostile.py
#
# Every scenario the marketplace security review raised against omarchy-ganja
# (omacom/omarchy-plugin-marketplace#6530) plus the ones specific to keeping
# seven files instead of one. A check that passes proves a refusal happened —
# reading nothing, or exiting non-zero — not that an error message was pretty.

import os
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.path.join(os.path.dirname(HERE), "save.py")
REL = ".local/state/omarchy/omahold"

passed = failed = 0


def check(cond, what):
    global passed, failed
    if cond:
        passed += 1
        print("  ok    %s" % what)
    else:
        failed += 1
        print("  FAIL  %s" % what)


def run(home, *args, stdin=b"", timeout=20):
    return subprocess.run(
        ["/usr/bin/python3", "-I", HELPER] + list(args),
        input=stdin, capture_output=True, timeout=timeout,
        env={"PATH": "/usr/bin:/bin", "HOME": home},
    )


def state_dir(home, make=True):
    d = os.path.join(home, REL)
    if make:
        os.makedirs(d, mode=0o700, exist_ok=True)
    return d


def fresh():
    home = tempfile.mkdtemp(prefix="omahold-hostile-")
    os.chmod(home, 0o700)
    return home


def main():
    if not os.path.exists(HELPER):
        print("save.py not found at %s" % HELPER)
        return 1
    print("save.py hostile checks")

    # --- 1. the normal round trip, and the mode it leaves behind -------------
    home = fresh()
    try:
        r = run(home, "write", REL, "world.json", stdin=b'{"v":1}')
        check(r.returncode == 0, "normal write succeeds")
        f = os.path.join(state_dir(home), "world.json")
        st = os.stat(f)
        check(stat.S_IMODE(st.st_mode) == 0o600, "save is mode 600")
        check(st.st_nlink == 1, "save has one link")
        check(stat.S_IMODE(os.stat(state_dir(home)).st_mode) == 0o700, "state dir is 700")
        r = run(home, "read", REL, "world.json")
        check(r.stdout == b'{"v":1}', "read gives back what was written")
    finally:
        shutil.rmtree(home, ignore_errors=True)

    # --- 2. several files in one read, in order, missing ones empty ----------
    home = fresh()
    try:
        d = state_dir(home)
        open(os.path.join(d, "options.json"), "w").write("OPT")
        open(os.path.join(d, "world.json"), "w").write("WORLD")
        r = run(home, "read", REL, "options.json", "slots.json", "world.json")
        check(r.stdout == b"OPT\x1e\x1eWORLD", "three-file read keeps order, missing one empty")
        r = run(home, "read", REL, "slot-3.json")
        check(r.returncode == 0 and r.stdout == b"", "missing file reads empty, not an error")
    finally:
        shutil.rmtree(home, ignore_errors=True)

    # --- 3. a FIFO in place of the save: must not hang -----------------------
    home = fresh()
    try:
        os.mkfifo(os.path.join(state_dir(home), "world.json"))
        t0 = time.time()
        try:
            r = run(home, "read", REL, "world.json", timeout=15)
            took = time.time() - t0
            check(r.stdout == b"", "FIFO in place of the save yields nothing")
            check(took < 10, "FIFO does not hang (took %.1fs)" % took)
        except subprocess.TimeoutExpired:
            check(False, "FIFO hung past the deadline")
    finally:
        shutil.rmtree(home, ignore_errors=True)

    # --- 4. a symlink at the leaf --------------------------------------------
    home = fresh()
    try:
        d = state_dir(home)
        secret = os.path.join(home, "secret")
        open(secret, "w").write("NOT YOURS")
        os.symlink(secret, os.path.join(d, "world.json"))
        r = run(home, "read", REL, "world.json")
        check(b"NOT YOURS" not in r.stdout, "symlinked save is not followed on read")
        r = run(home, "write", REL, "world.json", stdin=b'{"v":1}')
        check(open(secret).read() == "NOT YOURS", "symlinked save is not written through")
    finally:
        shutil.rmtree(home, ignore_errors=True)

    # --- 5. a symlink mid-path (the one O_NOFOLLOW alone misses) -------------
    home = fresh()
    try:
        elsewhere = os.path.join(home, "elsewhere")
        os.makedirs(os.path.join(elsewhere, "omahold"), mode=0o700)
        open(os.path.join(elsewhere, "omahold", "world.json"), "w").write("PLANTED")
        os.makedirs(os.path.join(home, ".local/state"), mode=0o700, exist_ok=True)
        os.symlink(elsewhere, os.path.join(home, ".local/state/omarchy"))
        r = run(home, "read", REL, "world.json")
        check(b"PLANTED" not in r.stdout, "symlink mid-path is not followed")
        r = run(home, "write", REL, "world.json", stdin=b'{"v":2}')
        check(r.returncode != 0, "write through a symlinked component is refused")
        check(open(os.path.join(elsewhere, "omahold", "world.json")).read() == "PLANTED",
              "the planted file was not overwritten")
    finally:
        shutil.rmtree(home, ignore_errors=True)

    # --- 6. a hardlink (no symlink check would catch this) -------------------
    home = fresh()
    try:
        d = state_dir(home)
        other = os.path.join(home, "other")
        open(other, "w").write("HARDLINKED")
        os.link(other, os.path.join(d, "world.json"))
        r = run(home, "read", REL, "world.json")
        check(b"HARDLINKED" not in r.stdout, "hardlinked save is refused (st_nlink)")
    finally:
        shutil.rmtree(home, ignore_errors=True)

    # --- 7. over the byte cap, both ways -------------------------------------
    home = fresh()
    try:
        open(os.path.join(state_dir(home), "world.json"), "w").write("x" * (2 << 20))
        r = run(home, "read", REL, "world.json")
        check(r.stdout == b"", "a 2 MiB save is refused, not truncated")
        r = run(home, "write", REL, "world.json", stdin=b"y" * (2 << 20))
        check(r.returncode != 0, "an oversized write is refused")
    finally:
        shutil.rmtree(home, ignore_errors=True)

    # --- 8. planted and stale temporaries ------------------------------------
    home = fresh()
    try:
        d = state_dir(home)
        planted = os.path.join(d, "world.json.deadbeefdeadbeef.tmp")
        open(planted, "w").write("PLANTED TMP")
        r = run(home, "write", REL, "world.json", stdin=b'{"v":3}')
        check(r.returncode == 0, "a planted temporary does not block the write")
        check(open(os.path.join(d, "world.json")).read() == '{"v":3}', "the real save was published")
        old = time.time() - 600
        os.utime(planted, (old, old))
        run(home, "read", REL, "world.json")
        check(not os.path.exists(planted), "a stale temporary is cleaned up")
        recent = os.path.join(d, "world.json.aaaaaaaaaaaaaaaa.tmp")
        open(recent, "w").write("in use")
        run(home, "read", REL, "world.json")
        check(os.path.exists(recent), "a fresh temporary is left alone (another instance)")
    finally:
        shutil.rmtree(home, ignore_errors=True)

    # --- 9. names outside the plugin's own set -------------------------------
    home = fresh()
    try:
        d = state_dir(home)
        open(os.path.join(home, ".bashrc"), "w").write("MINE")
        for bad in ["../../.bashrc", "/etc/passwd", ".bashrc", "world.json.tmp", "slot-9.json", "slot-0.json"]:
            r = run(home, "read", REL, bad)
            check(r.returncode != 0, "read refuses the name %r" % bad)
        r = run(home, "write", REL, "../../.bashrc", stdin=b"OWNED")
        check(r.returncode != 0 and open(os.path.join(home, ".bashrc")).read() == "MINE",
              "write refuses a name outside the plugin's files")
        r = run(home, "write", REL, "world.json", "options.json", stdin=b"x")
        check(r.returncode != 0, "write refuses more than one file")
    finally:
        shutil.rmtree(home, ignore_errors=True)

    # --- 9b. remove only reaches our own files, and follows no link ----------
    home = fresh()
    try:
        d = state_dir(home)
        open(os.path.join(d, "slot-2.json"), "w").write("SLOT")
        r = run(home, "remove", REL, "slot-2.json")
        check(r.returncode == 0 and not os.path.exists(os.path.join(d, "slot-2.json")),
              "remove deletes our own slot")
        keep = os.path.join(home, "keepme")
        open(keep, "w").write("MINE")
        os.symlink(keep, os.path.join(d, "slot-3.json"))
        r = run(home, "remove", REL, "slot-3.json")
        check(open(keep).read() == "MINE", "remove does not delete through a symlink target")
        r = run(home, "remove", REL, "../../.bashrc")
        check(r.returncode != 0, "remove refuses a name outside the plugin's files")
        r = run(home, "remove", REL, "slot-4.json")
        check(r.returncode == 0, "removing a file that is not there is fine")
    finally:
        shutil.rmtree(home, ignore_errors=True)

    # --- 10. a group-writable directory in the chain -------------------------
    home = fresh()
    try:
        d = state_dir(home)
        os.chmod(os.path.join(home, ".local/state/omarchy"), 0o770)
        r = run(home, "read", REL, "world.json")
        check(r.returncode != 0, "a group-writable component is refused")
        # ours is tightened instead of refused, so a loose state dir still loads
        os.chmod(os.path.join(home, ".local/state/omarchy"), 0o700)
        os.chmod(d, 0o777)
        open(os.path.join(d, "world.json"), "w").write("LOOSE")
        r = run(home, "read", REL, "world.json")
        check(r.stdout == b"LOOSE", "our own loose state dir is read")
        check(stat.S_IMODE(os.stat(d).st_mode) == 0o700, "and tightened to 700 while at it")
    finally:
        shutil.rmtree(home, ignore_errors=True)

    # --- 11. HOME missing, relative, or someone else's -----------------------
    for bad_home, what in [("", "empty"), ("relative/path", "relative")]:
        r = subprocess.run(["/usr/bin/python3", "-I", HELPER, "read", REL, "world.json"],
                           capture_output=True, env={"PATH": "/usr/bin:/bin", "HOME": bad_home})
        check(r.returncode != 0, "%s HOME is refused" % what)

    # --- 12. the helper carries no execute bit -------------------------------
    check(not (os.stat(HELPER).st_mode & (stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)),
          "save.py has no execute bit")
    with open(HELPER, "rb") as fh:
        check(not fh.read(2) == b"#!", "save.py has no shebang")

    print("\n%d checks, %d failed" % (passed + failed, failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
