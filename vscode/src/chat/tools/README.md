# WIP - Agentic Chat

## Instruction

Add the following settings to your `settings.json` file before building from this branch.

```json
// Example settings.json
{
  "cody.dev.models": [
    {
      "provider": "google",
      "model": "gemini-2.0-flash-thinking-exp-01-21",
      "apiKey": "$GEMINI_API_KEY",
      "inputTokens": 1000000
    },
    {
      "provider": "anthropic",
      "model": "claude-3-7-sonnet-latest",
      "apiKey": "ANTHROPIC_API_KEY",
      "inputTokens": 80000,
      "options": {
        "thinking": {
          "type": "enabled",
          "budget_tokens": 2000
        }
      }
    }
  ]
}
```

### Anthropic

Add your API keys for Anthropic to `"cody.experimental.minion.anthropicKey"` or `"cody.dev.models"` settings and select one of the following models to activate agentic mode:

- `Claude 3.5 Sonnet` to use the model in agentic mode.
- `Claude 3.7 Sonnet` to use the model with reasoning in agentic mode.

### Gemini

Add your API keys for Google Gemini to `"cody.dev.models"` settings and select any google model to activate agentic mode.

- Select any Gemini models, and it would activate the agentic mode using the `gemini-2.0-flash` model.
- `gemini-2.0-flash-thinking` does not support function calling
