package com.sourcegraph.common

import com.intellij.openapi.util.IconLoader.getIcon
import com.intellij.ui.AnimatedIcon
import javax.swing.Icon

object Icons {
  object StatusBar {
    val CompletionInProgress: Icon by lazy { AnimatedIcon.Default.INSTANCE }
    val CodyAvailable: Icon by lazy {
      getIcon("/icons/codyLogoMonochromatic.svg", Icons::class.java)
    }
    val CodyAutocompleteDisabled: Icon by lazy {
      getIcon("/icons/codyLogoHeavySlash.svg", Icons::class.java)
    }

    val CodyUnavailable: Icon by lazy {
      getIcon("/icons/codyLogoMonochromaticUnavailable.svg", Icons::class.java)
    }
  }

  object LLM {
    val Anthropic: Icon by lazy { getIcon("/icons/chat/llm/anthropic.svg", Icons::class.java) }
    val Google: Icon by lazy { getIcon("/icons/chat/llm/google.svg", Icons::class.java) }
    val OpenAI: Icon by lazy { getIcon("/icons/chat/llm/openai.svg", Icons::class.java) }
    val Mistral: Icon by lazy { getIcon("/icons/chat/llm/mistral.svg", Icons::class.java) }
    val Ollama: Icon by lazy { getIcon("/icons/chat/llm/ollama.svg", Icons::class.java) }
    val ProSticker: Icon by lazy { getIcon("/icons/chat/llm/proSticker.svg", Icons::class.java) }
  }

  val CodyLogo: Icon by lazy { getIcon("/icons/codyLogo.svg", Icons::class.java) }
  val CodyLogoSlash: Icon by lazy { getIcon("/icons/codyLogoHeavySlash.svg", Icons::class.java) }
  val SourcegraphLogo: Icon by lazy { getIcon("/icons/sourcegraphLogo.svg", Icons::class.java) }
  val GearPlain: Icon by lazy { getIcon("/icons/gearPlain.svg", Icons::class.java) }
}
