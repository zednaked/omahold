# The only place in this plugin that touches the disk.
#
# Always invoked as `/usr/bin/python3 -I save.py <mode> <args...>`, with a
# closed environment (Quickshell's Process uses `clearEnvironment`) and with no
# execute bit: a QML plugin that grows an executable changes category in a
# security review, a text file handed to the interpreter does not.
#
# ---------------------------------------------------------------------------
# Why Python, and not shell
#
# This was a `Process` running `sh -c 'mkdir -p "$1"; cat "$2"; …'` with the
# paths as arguments. Quoting was already right, but three things were not, and
# they are exactly what the marketplace security review blocked omarchy-ganja
# for twice (omacom/omarchy-plugin-marketplace#6530):
#
#   - `cat` has no byte cap and no deadline, inside a `StdioCollector` with
#     `waitForEnd: true`. A FIFO left in place of world.json hangs the bar's
#     shell; a huge substituted file exhausts it.
#   - nothing checked that what was read is a regular file, owned by the
#     caller, not a symlink, not a hardlink to someone else's file.
#   - and the deeper one: in shell every command resolves the path again from
#     the root, so a check with `[ -f ]` and a later `head`/`mv` are two
#     different resolutions, and what was checked can be exchanged in between.
#     `sh` cannot reach `openat`, `renameat` or `O_NOFOLLOW`.
#
# Python reaches them. `os.open(..., dir_fd=)` is `openat`, `os.rename(...,
# src_dir_fd=, dst_dir_fd=)` is `renameat`, `os.stat(..., dir_fd=,
# follow_symlinks=False)` is `fstatat`. So a directory's identity stops being a
# name resolved once per command and becomes a DESCRIPTOR, opened once,
# validated by `fstat`, and held through the read, the write, the fsync, the
# rename and the cleanup.
#
# What this guarantees:
#
#   - every path component is opened with O_NOFOLLOW|O_DIRECTORY from a
#     descriptor of the previous one, starting at $HOME. A component swapped
#     for a symlink anywhere in the chain makes the open FAIL rather than
#     follow — which a single `open(path, O_NOFOLLOW)` cannot do, since it only
#     protects the last component;
#   - the file is opened O_NOFOLLOW relative to that descriptor and validated
#     by `fstat` ON THE DESCRIPTOR ITSELF (regular, ours, a single link, within
#     the cap). There is no window between checking and reading: same fd;
#   - a write creates its temporary with O_CREAT|O_EXCL|O_NOFOLLOW on that
#     descriptor, writes, fsyncs, and publishes with `renameat` using the SAME
#     descriptor on both sides, then fsyncs the directory. The parent is never
#     re-resolved;
#   - no directory in the chain may be group- or world-writable. Ownership is
#     not enough: whoever can write IN a directory replaces the files inside it
#     without owning anything. Our own state directory is tightened to 700
#     rather than refused, because refusing to read would silently start a new
#     fortress over someone's save.
#
# Two things are tighter here than in the ganja helper, because this plugin
# keeps seven files instead of one:
#
#   - **the names are an allowlist**, not a pattern. The helper can only ever
#     touch world.json, options.json, slots.json and slot-1..5.json. Validating
#     characters would still let a caller bug reach a name we never meant to
#     write; a fixed set cannot.
#   - a read takes several names at once and answers in one stream, because the
#     panel needs three files at startup and three processes would be three
#     chances to be raced.
#
# The rest of the defenses stand: byte cap, SIGALRM deadline, and the
# interpreter in isolated mode (`-I`, which ignores PYTHON*, the user site and
# the script's own directory on sys.path).
#
# Dependency: python3. Omarchy's own scripts already use it, so this adds
# nothing to the machine — but it is stated in both READMEs.
# ---------------------------------------------------------------------------

import os
import signal
import stat
import sys

# A fortress with the 200-entry memorial and 300-entry chronicle the format
# keeps is ~40 KB, and a slot is the same. A mebibyte is twenty-five times the
# worst legitimate case; past that the file is not ours, and refusing beats
# truncating — truncated JSON would look like a corrupt save and start a new
# world over the old one.
MAX = 1 << 20

# Deadline for the whole operation. If it runs out the process dies with no
# output: reading nothing beats waiting forever, and that is what closes the
# FIFO case.
DEADLINE = 5

# Every file this plugin owns. Nothing outside this set can be read or written,
# whatever the caller asks for.
NAMES = frozenset(
    ["world.json", "options.json", "slots.json"]
    + ["slot-%d.json" % n for n in range(1, 6)]
)

TMP_SUFFIX = ".tmp"
STALE_SECONDS = 300

# Separates the files of a multi-file read, matching what the QML side splits
# on. A record separator cannot appear in JSON text.
RS = b"\x1e"


class Refused(Exception):
    """The disk is not in the state we promise; nothing is read or written."""


def die(msg):
    sys.stderr.write("zed.omahold/save.py: %s\n" % msg)
    sys.exit(1)


def own_dir_fd(fd, name="directory"):
    """Validate a directory by its descriptor, never by its name."""
    st = os.fstat(fd)
    if not stat.S_ISDIR(st.st_mode):
        raise Refused("%s is not a directory" % name)
    if st.st_uid != os.geteuid():
        raise Refused("%s belongs to another user" % name)
    # Owning a directory is not enough: whoever can write in it controls what
    # is inside, without owning any of it — they create, rename and replace.
    if st.st_mode & (stat.S_IWGRP | stat.S_IWOTH):
        raise Refused("%s is group/world writable (mode %04o); fix with "
                      "`chmod go-w`" % (name, stat.S_IMODE(st.st_mode)))
    return st


def harden_dir_fd(fd):
    """Tighten the mode of the state directory, which is ours alone.

    Only for the directory this plugin creates. If it exists with a loose mode
    — from an older version, a permissive umask, a restored backup — the right
    move is to fix it, not refuse: refusing the read would start a new
    fortress, and the next save would overwrite the old one.

    Done on the descriptor (`fchmod`), on the already-validated inode, before
    any read, so what is read comes out of a 700 directory. Not applied to the
    middle components (`.local`, `.local/state`): those are everybody's, not
    ours, and tightening them would be deciding for other programs.
    """
    st = os.fstat(fd)
    if (stat.S_ISDIR(st.st_mode) and st.st_uid == os.geteuid()
            and st.st_mode & (stat.S_IWGRP | stat.S_IWOTH)):
        os.fchmod(fd, 0o700)


def walk(root_fd, parts, create=False, own_last=False):
    """Descend component by component with openat + O_NOFOLLOW.

    Returns a descriptor for the last directory. A symlink in ANY component
    makes `os.open` raise (ELOOP) instead of following it — which is why this
    walks step by step instead of opening the whole path at once.
    """
    fd = root_fd
    opened = []
    try:
        for i, part in enumerate(parts):
            if part in ("", ".", ".."):
                raise Refused("invalid path component: %r" % part)
            if create:
                try:
                    # 0o700 still passes through the umask, which only removes
                    # bits — a permissive umask cannot loosen what we asked for.
                    os.mkdir(part, 0o700, dir_fd=fd)
                except FileExistsError:
                    pass
            nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                          dir_fd=fd)
            opened.append(nxt)
            if own_last and i == len(parts) - 1:
                harden_dir_fd(nxt)
            own_dir_fd(nxt, part)
            fd = nxt
        return fd, opened
    except Exception:
        for x in opened:
            os.close(x)
        raise


def home_fd():
    home = os.environ.get("HOME", "")
    if not home or not home.startswith("/"):
        raise Refused("HOME missing or relative")
    # $HOME is the root of trust: the only path opened by name, and everything
    # below it descends from a descriptor of it.
    fd = os.open(home, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        own_dir_fd(fd, "$HOME")
    except Exception:
        os.close(fd)
        raise
    return fd


def checked_name(name):
    if name not in NAMES:
        raise Refused("%r is not one of this plugin's files" % name)
    return name


def read_at(dir_fd, name):
    """Read a file through the directory descriptor, following no link."""
    # O_NONBLOCK matters because of the FIFO: opening one for reading blocks
    # until someone opens it for writing. With O_NONBLOCK the open returns at
    # once, and the `fstat` below rejects it for not being a regular file.
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC,
                 dir_fd=dir_fd)
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode):
            raise Refused("%s is not a regular file" % name)
        if st.st_uid != os.geteuid():
            raise Refused("%s belongs to another user" % name)
        if st.st_nlink != 1:
            raise Refused("%s has %d links" % (name, st.st_nlink))
        if st.st_size > MAX:
            raise Refused("%s is %d bytes, over the %d cap" % (name, st.st_size, MAX))

        # The cap applies to the read too, not just to the `fstat`: between the
        # two the file can grow, and what matters is what fits in memory.
        chunks = []
        left = MAX
        while left > 0:
            b = os.read(fd, min(65536, left))
            if not b:
                break
            chunks.append(b)
            left -= len(b)
        return b"".join(chunks)
    finally:
        os.close(fd)


def write_at(dir_fd, name, data):
    """Write and publish without re-resolving the parent at any step."""
    if len(data) > MAX:
        raise Refused("content is %d bytes, over the %d cap" % (len(data), MAX))
    if not data:
        raise Refused("empty content")

    # Unpredictable name AND exclusive creation AND no-follow: all three in the
    # same `openat`. If anything exists under that name, creation fails.
    tmp = name + "." + os.urandom(8).hex() + TMP_SUFFIX
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                 0o600, dir_fd=dir_fd)
    try:
        written = 0
        while written < len(data):
            written += os.write(fd, data[written:])
        os.fsync(fd)
    except Exception:
        os.close(fd)
        try:
            os.unlink(tmp, dir_fd=dir_fd)
        except OSError:
            pass
        raise
    os.close(fd)

    try:
        # `renameat` on both sides with the SAME descriptor: neither source nor
        # destination is resolved from the root.
        os.rename(tmp, name, src_dir_fd=dir_fd, dst_dir_fd=dir_fd)
    except Exception:
        try:
            os.unlink(tmp, dir_fd=dir_fd)
        except OSError:
            pass
        raise

    # Without this the new name can survive a power cut pointing at nothing.
    os.fsync(dir_fd)


def clean_stale(dir_fd, now):
    """Remove a write temporary that died halfway, and only that."""
    for name in os.listdir(dir_fd):
        if not name.endswith(TMP_SUFFIX) or name in NAMES:
            continue
        try:
            st = os.stat(name, dir_fd=dir_fd, follow_symlinks=False)
            # A temporary from just now may belong to another instance writing
            # at this moment; five minutes is the line between "in use" and
            # "left over".
            if now - st.st_mtime > STALE_SECONDS:
                os.unlink(name, dir_fd=dir_fd)
        except OSError:
            pass


def split(rel):
    return [p for p in rel.split("/") if p != ""]


def main(argv):
    signal.alarm(DEADLINE)

    if len(argv) < 4:
        die("usage: save.py <read|write|remove> <dir-relative-to-HOME> <name...>")
    mode, rel = argv[1], argv[2]
    names = [checked_name(a) for a in argv[3:]]

    hfd = home_fd()
    try:
        if mode == "read":
            # A directory that is not there yet is the first run: not an
            # error, just "no save". Anything else — a refused mode, a symlink
            # planted mid-path — propagates and exits non-zero.
            #
            # The distinction matters more than it looks: swallowing a refusal
            # as "no save" made a hostile or merely broken state directory
            # indistinguishable from a fresh install, so the panel would start
            # a new fortress and the next autosave would overwrite the save the
            # helper had just refused to read.
            try:
                dfd, opened = walk(hfd, split(rel), own_last=True)
            except FileNotFoundError:
                sys.stdout.buffer.write(RS * (len(names) - 1))
                return 0
            try:
                import time
                clean_stale(dfd, time.time())
                out = []
                for name in names:
                    try:
                        out.append(read_at(dfd, name))
                    except (OSError, Refused):
                        out.append(b"")
                sys.stdout.buffer.write(RS.join(out))
            finally:
                for x in opened:
                    os.close(x)
            return 0

        if mode == "remove":
            # Clearing a save slot. This was `execDetached(["rm", "-f", path])`,
            # which re-resolves the whole path as root of its own and would
            # follow a symlink planted at the leaf. `unlinkat` on the pinned
            # descriptor cannot leave the directory we validated, and the
            # allowlist means it can only ever name a slot of ours.
            try:
                dfd, opened = walk(hfd, split(rel), own_last=True)
            except FileNotFoundError:
                return 0
            try:
                for name in names:
                    try:
                        os.unlink(name, dir_fd=dfd)
                    except FileNotFoundError:
                        pass
                os.fsync(dfd)
            finally:
                for x in opened:
                    os.close(x)
            return 0

        if mode == "write":
            if len(names) != 1:
                die("write takes exactly one file")
            # Capped on the way in too: stdin can be endless.
            #
            # The content always arrives on stdin, never as an argument: a
            # process argument shows up in `ps` for every user on the machine,
            # and a save holds the whole chronicle.
            data = sys.stdin.buffer.read(MAX + 1)

            dfd, opened = walk(hfd, split(rel), create=True, own_last=True)
            try:
                write_at(dfd, names[0], data)
            finally:
                for x in opened:
                    os.close(x)
            return 0

        die("unknown mode: %s" % mode)
    finally:
        os.close(hfd)


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except Refused as e:
        die(str(e))
    except OSError as e:
        die("system error: %s" % e)
