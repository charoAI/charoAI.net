# CYBERSPYKE — the `net` module, injected into every script's interpreter.
# Player scripts do `import net` and call these functions. Each call crosses
# the bridge to the game engine; timed operations genuinely block until the
# operation completes in game time.

import json
import sys
import types

import _cyberspyke_bridge as _bridge


class NetError(Exception):
    """Raised when a net operation is rejected by the grid."""


def _call(fn, *args):
    resp = json.loads(_bridge.call(fn, json.dumps(list(args))))
    if not resp.get("ok"):
        raise NetError(resp.get("error", "unknown grid error"))
    return resp.get("value")


def _make_module(host, argv):
    net = types.ModuleType("net")
    net.__doc__ = "CYBERSPYKE grid interface. See the Docs tab in-game for the full reference."

    net.NetError = NetError
    net.args = list(argv)

    def hostname():
        """The server this script is running on."""
        return host

    def hack(target):
        """Siphon credits from a rooted server. Blocks. Returns credits gained (0 on a failed attempt)."""
        return _call("hack", target)

    def grow(target):
        """Fluff a server's available credits back up. Blocks. Returns the server's new balance."""
        return _call("grow", target)

    def weaken(target):
        """Scrub a server's security level down. Blocks. Returns the new security level."""
        return _call("weaken", target)

    def nuke(target):
        """Force root access, if you own enough crackers for its locks. Returns True on success."""
        return _call("nuke", target)

    def scan(target=None):
        """List servers wired to `target` (default: this server). Returns a list of hostnames."""
        return _call("scan", target if target is not None else host)

    def server(target):
        """A dict of everything you know about a server: money, security, ram, and more."""
        return _call("server", target)

    def servers():
        """A list of every hostname you have discovered so far."""
        return _call("servers")

    def money():
        """Your current credit balance."""
        return _call("money")

    def skill():
        """Your current skill level."""
        return _call("skill")

    def sleep(seconds):
        """Do nothing for a while. Blocks."""
        return _call("sleep", float(seconds))

    def run(script, target="home", *argv):
        """Launch another script on a rooted server. Returns its pid, or 0 if it could not start."""
        return _call("run", script, target, list(argv))

    def ps():
        """A list of running scripts: [{pid, script, host, args}, ...]."""
        return _call("ps")

    def kill(pid):
        """Stop a running script by pid. Returns True if something died."""
        return _call("kill", int(pid))

    def has_root(target):
        """True if you have root on the server."""
        return _call("has_root", target)

    def hack_time(target):
        """Seconds a hack() against this server would take right now."""
        return _call("hack_time", target)

    def grow_time(target):
        """Seconds a grow() against this server would take right now."""
        return _call("grow_time", target)

    def weaken_time(target):
        """Seconds a weaken() against this server would take right now."""
        return _call("weaken_time", target)

    def log(*parts):
        """Write to this script's log (same place print() goes)."""
        _bridge.log(" ".join(str(p) for p in parts))

    def contracts():
        """List servers that currently hold a coding contract. Returns hostnames."""
        return _call("contracts")

    def contract(target):
        """Read a server's contract: dict {type, title, description, data, tries, reward}, or None."""
        return _call("contract", target)

    def solve(target, answer):
        """Submit an answer to a server's contract. Returns {correct, reward, tries_left, failed}."""
        return _call("solve", target, answer)

    for fn in (hostname, hack, grow, weaken, nuke, scan, server, servers, money,
               skill, sleep, run, ps, kill, has_root, hack_time, grow_time,
               weaken_time, log, contracts, contract, solve):
        setattr(net, fn.__name__, fn)

    sys.modules["net"] = net
    return net
