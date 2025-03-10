package com.sourcegraph.common

import com.intellij.openapi.util.IconLoader.getIcon
import com.intellij.ui.AnimatedIcon
import javax.swing.Icon

object Icons {
  object StatusBar {
    val CompletionInProgress: Icon = AnimatedIcon.Default.INSTANCE
    val CodyAvailable: Icon = getIcon("/icons/codyLogoMonochromatic.svg", Icons::class.java)
    val CodyAutocompleteDisabled: Icon = getIcon("/icons/codyLogoHeavySlash.svg", Icons::class.java)

    val CodyUnavailable: Icon = getIcon("/icons/codyLogoMonochromaticUnavailable.svg", Icons::class.java)
  }

  object LLM {
    val Anthropic: Icon = getIcon("/icons/chat/llm/anthropic.svg", Icons::class.java)
    val Google: Icon = getIcon("/icons/chat/llm/google.svg", Icons::class.java)
    val OpenAI: Icon = getIcon("/icons/chat/llm/openai.svg", Icons::class.java)
    val Mistral: Icon = getIcon("/icons/chat/llm/mistral.svg", Icons::class.java)
    val Ollama: Icon = getIcon("/icons/chat/llm/ollama.svg", Icons::class.java)
    val ProSticker: Icon = getIcon("/icons/chat/llm/proSticker.svg", Icons::class.java)
  }

  val CodyLogo: Icon = getIcon("/icons/codyLogo.svg", Icons::class.java)
  val SourcegraphLogo: Icon = getIcon("/icons/sourcegraphLogo.svg", Icons::class.java)

  val GearPlain: Icon = getIcon("/icons/gearPlain.svg", Icons::class.java)
  val CodyLogoSlash: Icon = getIcon("/icons/codyLogoHeavySlash.svg", Icons::class.java)
}