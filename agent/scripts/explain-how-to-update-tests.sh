#!/usr/bin/env bash
echo "If this test failed without changes to the agent then you may be able to fix the test by updating the HTTP recordings with the following command

  export SRC_ACCESS_TOKEN=sgp_YOUR_ACCESS_TOKEN # redacted in the recordings
  export SRC_ENDPOINT=https://sourcegraph.com   # tests run against dotcom
  src login                                     # confirm you are authenticated to sourcegraph.com
  CODY_RECORDING_MODE=record pnpm run test      # run tests to update recordings

Running the commanda above updates the HTTP recordings in the 'agent/recordings' directory. If the test passes then you can commit the changes to the recordings."
exit 1
