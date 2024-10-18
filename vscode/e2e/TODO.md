Framework:
- Make sure "Missing recording" errors show up in traces again
- Streamline pre-auth DX
- Split out framework from tests
- Safe UI action wrapper; ensuring a pre-and-post locator to verify action completed correctly.
- Handle telemetry delays & asserts in snapshotter
- Fix windows minor issues
- User "record my issue" mode
- Enable CI
- Add docs about interactive debugging
- Fix playwright VSCode extension debugger slowness

Telemetry:
- Pre-configured normalized
- Re-factor events to be more similar to `lib/shared/src/configuration/environment.ts` so that goto definitino works.
