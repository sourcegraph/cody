#!/usr/bin/env python3
import json
import time
from datetime import datetime

def generate_credentials():
    current_epoch = int(time.time()) + 100

    credentials = {
        "headers": {
            "Authorization": "Bearer SomeUser",
            "Expiration": current_epoch,
        },
        "expiration": current_epoch
    }

    # Print JSON to stdout
    print(json.dumps(credentials))

if __name__ == "__main__":
    generate_credentials()
