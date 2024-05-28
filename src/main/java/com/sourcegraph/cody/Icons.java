package com.sourcegraph.cody;

import com.intellij.openapi.util.IconLoader;
import com.intellij.ui.AnimatedIcon;
import javax.swing.*;

public interface Icons {
  Icon CodyLogo = IconLoader.getIcon("/icons/codyLogo.svg", Icons.class);
  Icon HiImCody = IconLoader.getIcon("/icons/hiImCodyLogo.svg", Icons.class);

  interface Actions {
    Icon Add = IconLoader.getIcon("/icons/actions/huge_plus.svg", Icons.class);
    Icon Edit = IconLoader.getIcon("/icons/actions/pencil.svg", Icons.class);
    Icon Hide = IconLoader.getIcon("/icons/actions/hide.svg", Icons.class);
    Icon Send = IconLoader.getIcon("/icons/actions/send.svg", Icons.class);
    Icon DisabledSend = IconLoader.getIcon("/icons/actions/disabledSend.svg", Icons.class);
  }

  interface StatusBar {
    Icon CompletionInProgress = new AnimatedIcon.Default();
    Icon CodyAvailable = IconLoader.getIcon("/icons/codyLogoMonochromatic.svg", Icons.class);
    Icon CodyAutocompleteDisabled =
        IconLoader.getIcon("/icons/cody-logo-heavy-slash.svg", Icons.class);

    Icon CodyUnavailable =
        IconLoader.getIcon("/icons/codyLogoMonochromaticUnavailable.svg", Icons.class);
  }

  interface Onboarding {
    Icon Autocomplete = IconLoader.getIcon("/icons/onboarding/autocomplete.svg", Icons.class);
    Icon Chat = IconLoader.getIcon("/icons/onboarding/chat.svg", Icons.class);
    Icon Commands = IconLoader.getIcon("/icons/onboarding/commands.svg", Icons.class);
  }

  interface SignIn {
    Icon Github = IconLoader.getIcon("/icons/signIn/sign-in-logo-github.svg", Icons.class);
    Icon Gitlab = IconLoader.getIcon("/icons/signIn/sign-in-logo-gitlab.svg", Icons.class);
    Icon Google = IconLoader.getIcon("/icons/signIn/sign-in-logo-google.svg", Icons.class);
  }

  interface Chat {
    Icon ChatLeaf = IconLoader.getIcon("/icons/chat/chatLeaf.svg", Icons.class);
    Icon Download = IconLoader.getIcon("/icons/chat/download.svg", Icons.class);
  }

  interface Edit {
    Icon Error = IconLoader.getIcon("/icons/edit/error.svg", Icons.class);
    Icon Beta = IconLoader.getIcon("/icons/edit/beta.svg", Icons.class);
  }

  interface LLM {
    Icon Anthropic = IconLoader.getIcon("/icons/chat/llm/anthropic.svg", Icons.class);
    Icon OpenAI = IconLoader.getIcon("/icons/chat/llm/openai.svg", Icons.class);
    Icon Mistral = IconLoader.getIcon("/icons/chat/llm/mistral.svg", Icons.class);
    Icon ProSticker = IconLoader.getIcon("/icons/chat/llm/pro_sticker.svg", Icons.class);
  }
}
