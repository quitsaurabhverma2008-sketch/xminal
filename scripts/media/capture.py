import fcntl, os, pty, select, struct, termios, time

def set_winsize(fd, rows, cols):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

def capture(bin_path, script, cols=92, rows=28, settle=0.55, cwd="/data/data/com.termux/files/home",
            cmd=None, env_extra=None, env_base=None):
    master, slave = pty.openpty()
    set_winsize(slave, rows, cols)
    set_winsize(master, rows, cols)
    env = os.environ.copy()
    env.update(env_base or {})
    env.update(env_extra or {})
    pid = os.fork()
    if pid == 0:
        os.setsid()
        os.dup2(slave, 0); os.dup2(slave, 1); os.dup2(slave, 2)
        os.chdir(cwd)
        os.execvpe(cmd[0], cmd, env)
    os.close(slave)
    buf = {"out": b""}
    def drain(t):
        end = time.time() + t
        while time.time() < end:
            r,_,_ = select.select([master], [], [], 0.02)
            if r:
                try: buf["out"] += os.read(master, 65536)
                except OSError: return
    def shot():
        open(bin_path, "wb").write(buf["out"])
    drain(settle)
    script(master, drain, shot)
    try: os.close(master)
    except Exception: pass
    return bin_path
