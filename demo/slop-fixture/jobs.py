def run_job(job):
    try:
        return job.run()
    except Exception:
        pass
