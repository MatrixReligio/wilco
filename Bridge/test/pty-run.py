# Runs a program on a pseudo-terminal, as if in Terminal: what is written to this script's
# stdin is typed, and the screen goes to stdout. Used to test wilco-bridge in Pi's TUI.
# Usage: python3 -I pty-run.py <program> [args...]
import fcntl, os, pty, select, signal, struct, sys, termios, time

pid, fd = pty.fork()
if pid == 0:
    os.execvp(sys.argv[1], sys.argv[1:])

def stop(signum, _frame):
    # Close the terminal, as when its window is closed (the program gets SIGHUP), and wait for
    # the program to end, so whoever stops this script knows the program is gone (and has
    # stopped writing to its files) once this script has exited.
    try:
        os.close(fd)
    except OSError:
        pass
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        try:
            done, _ = os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            break
        if done:
            break
        time.sleep(0.05)
    else:
        try:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)
        except (ProcessLookupError, ChildProcessError):
            pass
    sys.exit(0)

signal.signal(signal.SIGTERM, stop)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
stdin_open = True
while True:
    fds = [fd] + ([0] if stdin_open else [])
    try:
        ready, _, _ = select.select(fds, [], [], 0.2)
    except InterruptedError:
        continue
    if fd in ready:
        try:
            data = os.read(fd, 65536)
        except OSError:
            break
        if not data:
            break
        os.write(1, data)
    if 0 in ready:
        data = os.read(0, 65536)
        if not data:
            stdin_open = False
        else:
            os.write(fd, data)
    done, _ = os.waitpid(pid, os.WNOHANG)
    if done:
        break
