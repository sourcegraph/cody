package com.sourcegraph.cody.agent.protocol_extensions

import com.sourcegraph.cody.agent.protocol_generated.ClientCapabilities
import com.sourcegraph.cody.agent.protocol_generated.ClientCapabilities.ChatEnum
import com.sourcegraph.cody.agent.protocol_generated.ClientCapabilities.CodeLensesEnum
import com.sourcegraph.cody.agent.protocol_generated.ClientCapabilities.CompletionsEnum
import com.sourcegraph.cody.agent.protocol_generated.ClientCapabilities.EditEnum
import com.sourcegraph.cody.agent.protocol_generated.ClientCapabilities.EditWorkspaceEnum
import com.sourcegraph.cody.agent.protocol_generated.ClientCapabilities.GitEnum
import com.sourcegraph.cody.agent.protocol_generated.ClientCapabilities.IgnoreEnum
import com.sourcegraph.cody.agent.protocol_generated.ClientCapabilities.ProgressBarsEnum
import com.sourcegraph.cody.agent.protocol_generated.ClientCapabilities.ShowDocumentEnum
import com.sourcegraph.cody.agent.protocol_generated.ClientCapabilities.UntitledDocumentsEnum

object ClientCapabilitiesFactory {
  fun build(
      completions: String? = null,
      chat: String? = null,
      git: String? = null,
      progressBars: String? = null,
      edit: String? = null,
      editWorkspace: String? = null,
      codeLenses: String? = null,
      showDocument: String? = null,
      ignore: String? = null,
      untitledDocuments: String? = null
  ): ClientCapabilities {
    return ClientCapabilities(
        completions = completions?.toEnumIgnoreCase<CompletionsEnum>(),
        chat = chat?.toEnumIgnoreCase<ChatEnum>(),
        git = git?.toEnumIgnoreCase<GitEnum>(),
        progressBars = progressBars?.toEnumIgnoreCase<ProgressBarsEnum>(),
        edit = edit?.toEnumIgnoreCase<EditEnum>(),
        editWorkspace = editWorkspace?.toEnumIgnoreCase<EditWorkspaceEnum>(),
        codeLenses = codeLenses?.toEnumIgnoreCase<CodeLensesEnum>(),
        showDocument = showDocument?.toEnumIgnoreCase<ShowDocumentEnum>(),
        ignore = ignore?.toEnumIgnoreCase<IgnoreEnum>(),
        untitledDocuments = untitledDocuments?.toEnumIgnoreCase<UntitledDocumentsEnum>())
  }
}
