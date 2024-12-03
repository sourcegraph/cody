package com.sourcegraph.cody.autocomplete;

import java.util.Arrays;
import java.util.Optional;
import org.jetbrains.annotations.NotNull;

public enum AutocompleteProviderType {
  ANTHROPIC,
  FIREWORKS,
  EXPERIMENTAL_OLLAMA,
  EXPERIMENTAL_OPENAICOMPATIBLE,
  UNSTABLE_OPENAI;

  public static Optional<AutocompleteProviderType> optionalValueOf(@NotNull String name) {
    switch (name) {
      case "unstable-fireworks":
        return Optional.of(FIREWORKS);
      default:
        return Arrays.stream(AutocompleteProviderType.values())
            .filter(providerType -> providerType.vscodeSettingString().equals(name))
            .findFirst();
    }
  }

  public String vscodeSettingString() {
    return super.toString().toLowerCase().replace('_', '-');
  }
}
