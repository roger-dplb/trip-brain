import os
import time


def run() -> None:
    interval = int(os.getenv("WORKER_POLL_INTERVAL", "15"))
    print("Worker started: embedding + thumbnail pipeline (skeleton).")

    while True:
        print("Polling jobs... (placeholder)")
        time.sleep(interval)


if __name__ == "__main__":
    run()
