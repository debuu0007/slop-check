try:
    load()
except Exception as error:
    logger.exception(error)
    raise
