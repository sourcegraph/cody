package com.sourcegraph;

import com.intellij.openapi.util.IconLoader;
import com.intellij.ui.AnimatedIcon;
import javax.swing.*;

public interface Icons {
  Icon CodyLogo = IconLoader.getIcon("/icons/codyLogo.svg", Icons.class);
  Icon SourcegraphLogo = IconLoader.getIcon("/icons/sourcegraphLogo.svg", Icons.class);

  Icon GearPlain = IconLoader.getIcon("/icons/gearPlain.svg", Icons.class);
  Icon CodyLogoSlash = IconLoader.getIcon("/icons/codyLogoHeavySlash.svg", Icons.class);

  interface StatusBar {
    Icon CompletionInProgress = AnimatedIcon.Default.INSTANCE;
    Icon CodyAvailable = IconLoader.getIcon("/icons/codyLogoMonochromatic.svg", Icons.class);
    Icon CodyAutocompleteDisabled =
        IconLoader.getIcon("/icons/codyLogoHeavySlash.svg", Icons.class);

    Icon CodyUnavailable =
        IconLoader.getIcon("/icons/codyLogoMonochromaticUnavailable.svg", Icons.class);
  }

  interface LLM {
    Icon Anthropic = IconLoader.getIcon("/icons/chat/llm/anthropic.svg", Icons.class);
    Icon Google = IconLoader.getIcon("/icons/chat/llm/google.svg", Icons.class);
    Icon OpenAI = IconLoader.getIcon("/icons/chat/llm/openai.svg", Icons.class);
    Icon Mistral = IconLoader.getIcon("/icons/chat/llm/mistral.svg", Icons.class);
    Icon Ollama = IconLoader.getIcon("/icons/chat/llm/ollama.svg", Icons.class);
    Icon ProSticker = IconLoader.getIcon("/icons/chat/llm/proSticker.svg", Icons.class);
  }
}
