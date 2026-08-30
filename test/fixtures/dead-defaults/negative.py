def _connect(host, retries=3):
    return host, retries

_connect("example.test", 5)


def _direct(project: dict[str, Any], *, protected: bool = False):
    return project, protected

_direct({}, protected=True)


def _human_join(seq, *, delim: str = ", ", final="or"):
    return delim.join(seq) + final

_human_join(["a"], final="and")


def public_helper(value, deep=False):
    return value, deep

public_helper(1)
