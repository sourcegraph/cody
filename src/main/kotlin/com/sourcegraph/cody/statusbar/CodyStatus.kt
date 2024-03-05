package com.sourcegraph.cody.statusbar

import com.intellij.util.ui.PresentableEnum
import com.sourcegraph.cody.Icons
import com.sourcegraph.cody.agent.CodyAgentService
import javax.swing.Icon

interface WithIcon {
  val icon: Icon?
}

enum class CodyStatus : PresentableEnum, WithIcon {
  CodyUninit {
    override fun getPresentableText(): String = "Cody is starting"

    override val icon: Icon = Icons.StatusBar.CodyAutocompleteDisabled
  },
  CodyDisabled {
    override fun getPresentableText(): String = ""

    override val icon: Icon? = null
  },
  AutocompleteDisabled {
    override fun getPresentableText(): String = "Cody autocomplete is disabled"

    override val icon: Icon = Icons.StatusBar.CodyAutocompleteDisabled
  },
  CodyNotSignedIn {
    override fun getPresentableText(): String = "No account signed-in"

    override val icon: Icon = Icons.StatusBar.CodyUnavailable
  },
  CodyAgentNotRunning {
    override fun getPresentableText(): String = "Cody encountered an unexpected error"

    override val icon: Icon = Icons.StatusBar.CodyUnavailable
  },
  AgentError {
    override fun getPresentableText(): String =
        "Cody encountered an error: ${CodyAgentService.agentError.get()}"

    override val icon: Icon = Icons.StatusBar.CodyUnavailable
  },
  RateLimitError {
    override fun getPresentableText(): String = "Rate limit reached"

    override val icon: Icon = Icons.StatusBar.CodyUnavailable
  },
  Ready {
    override fun getPresentableText(): String = "Cody autocomplete is enabled"

    override val icon: Icon = Icons.StatusBar.CodyAvailable
  },
  AutocompleteInProgress {
    override fun getPresentableText(): String = "Cody autocomplete is in progress"

    override val icon: Icon = Icons.StatusBar.CompletionInProgress
  }
}
