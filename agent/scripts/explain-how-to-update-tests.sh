#!/usr/bin/env bash
echo "If this test failed without changes to the agent then you may be able to fix the test by updating the HTTP recordings with the following command"
echo ""
echo "  CODY_RECORDING_MODE=record pnpm run test"
echo ""
echo "Running the commanda above updates the HTTP recordings in the 'agent/recordings' directory. If the test passes then you can commit the changes to the recordings."
exit 1
