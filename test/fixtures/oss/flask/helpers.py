def get_debug_flag(environ):
    value = environ.get("FLASK_DEBUG")
    return bool(value and value.lower() not in {"0", "false", "no"})


def stream_with_context(generator, context):
    context.push()
    try:
        yield from generator
    finally:
        context.pop()
