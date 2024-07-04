# Context Caching for Autocomplete

To test autocomplete with context caching:

1. In your VS Code user settings, add the dev model with the Google AI Studio token (Search internal 1Password):
   ```json
   	"cody.dev.models": [
       {
         "provider": "google",
         "model": "gemini-1.5-flash-001",
         "apiKey": "GOOGLE_AI_STUDIO_TOKEN"
       }
   ]
   ```
2. In your VS Code user settings, Set `cody.autocomplete.advanced.provider` to `unstable-gemini`.
3. Start Cody in VS Code debug mode from this branch.
4. Open the sourcegraph/cody repository in VS Code.
5. Try autocompleting in different files and observe the results and time.
