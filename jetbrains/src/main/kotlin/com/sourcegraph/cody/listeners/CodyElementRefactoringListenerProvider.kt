package com.sourcegraph.cody.listeners

import com.intellij.psi.PsiElement
import com.intellij.refactoring.listeners.RefactoringElementListener
import com.intellij.refactoring.listeners.RefactoringElementListenerProvider
import com.sourcegraph.cody.agent.CodyAgentService.Companion.withServer
import com.sourcegraph.cody.agent.protocol_extensions.ProtocolTextDocumentExt.uriFor
import com.sourcegraph.cody.agent.protocol_generated.TextDocument_DidRenameParams

class CodyElementListenerProvider : RefactoringElementListenerProvider {
  override fun getListener(element: PsiElement): RefactoringElementListener {
    val uriBefore = uriFor(element.containingFile.virtualFile)
    return object : RefactoringElementListener {
      override fun elementMoved(p0: PsiElement) = notifyAgent(p0)

      override fun elementRenamed(p0: PsiElement) = notifyAgent(p0)

      private fun notifyAgent(p0: PsiElement) {
        val uriAfter = uriFor(p0.containingFile.virtualFile)
        assert(uriBefore != uriAfter)
        withServer(element.project) { server ->
          server.textDocument_didRename(TextDocument_DidRenameParams(uriBefore, uriAfter))
        }
      }
    }
  }
}
