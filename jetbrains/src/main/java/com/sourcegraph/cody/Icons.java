package com.sourcegraph.cody;

import com.intellij.openapi.util.IconLoader;
import com.intellij.ui.AnimatedIcon;
import javax.swing.*;

public interface Icons {
  Icon CodyLogo = IconLoader.getIcon("/icons/codyLogo.svg", Icons.class);

  interface Actions {
    Icon Add = IconLoader.getIcon("/icons/actions/huge_plus.svg", Icons.class);
    Icon Edit = IconLoader.getIcon("/icons/actions/pencil.svg", Icons.class);
    Icon Hide = IconLoader.getIcon("/icons/actions/hide.svg", Icons.class);
    Icon Send = IconLoader.getIcon("/icons/actions/send.svg", Icons.class);
    Icon DisabledSend = IconLoader.getIcon("/icons/actions/disabledSend.svg", Icons.class);
  }

  interface StatusBar {
    Icon CompletionInProgress = AnimatedIcon.Default.INSTANCE;
    Icon CodyAvailable = IconLoader.getIcon("/icons/codyLogoMonochromatic.svg", Icons.class);
    Icon CodyAutocompleteDisabled =
        IconLoader.getIcon("/icons/cody-logo-heavy-slash.svg", Icons.class);

    Icon CodyUnavailable =
        IconLoader.getIcon("/icons/codyLogoMonochromaticUnavailable.svg", Icons.class);
  }

  interface Edit {
    Icon Error = IconLoader.getIcon("/icons/edit/error.svg", Icons.class);
  }

  interface LLM {
    Icon Anthropic = IconLoader.getIcon("/icons/chat/llm/anthropic.svg", Icons.class);
    Icon Google = IconLoader.getIcon("/icons/chat/llm/google.svg", Icons.class);
    Icon OpenAI = IconLoader.getIcon("/icons/chat/llm/openai.svg", Icons.class);
    Icon Mistral = IconLoader.getIcon("/icons/chat/llm/mistral.svg", Icons.class);
    Icon Ollama = IconLoader.getIcon("/icons/chat/llm/ollama.svg", Icons.class);
    Icon ProSticker = IconLoader.getIcon("/icons/chat/llm/pro_sticker.svg", Icons.class);
  }
}
