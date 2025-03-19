# Updating HTTP Recordings for Tests

Some tests are failing because HTTP recordings are outdated. This happens when:

1. The UI changes (like our login form placeholder update)
2. The API responses change
3. Test expectations change

To fix these issues, maintainers need to:

1. Run the following commands locally:

```bash
source agent/scripts/export-cody-http-recording-tokens.sh
pnpm update-agent-recordings
```

2. Commit the updated recordings

> **Note**: These recordings contain API tokens, but they're redacted for security. You'll need access to the actual tokens via gcloud secrets.

For non-maintainers, please request a maintainer to update the recordings.