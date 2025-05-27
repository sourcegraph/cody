package com.sourcegraph.cody.listeners

import com.intellij.psi.PsiElement
import com.intellij.refactoring.listeners.RefactoringElementListener
import com.intellij.refactoring.listeners.RefactoringElementListenerProvider
import com.sourcegraph.cody.agent.CodyAgentService.Companion.withAgent
import com.sourcegraph.cody.agent.protocol_extensions.ProtocolTextDocumentExt.vscNormalizedUriFor
import com.sourcegraph.cody.agent.protocol_generated.TextDocument_DidRenameParams

class CodyElementListenerProvider : RefactoringElementListenerProvider {
  override fun getListener(element: PsiElement): RefactoringElementListener {
    val uriBefore = vscNormalizedUriFor(element.containingFile.virtualFile)
    return object : RefactoringElementListener {
      override fun elementMoved(newPsiElement: PsiElement) = notifyAgent(newPsiElement)

      override fun elementRenamed(newPsiElement: PsiElement) = notifyAgent(newPsiElement)

      private fun notifyAgent(newPsiElement: PsiElement) {
        val uriAfter = vscNormalizedUriFor(newPsiElement.containingFile.virtualFile)
        if (uriBefore == null || uriAfter == null) {
          return
        }
        assert(uriBefore != uriAfter)
        withAgent(element.project) { agent ->
          agent.server.textDocument_didRename(TextDocument_DidRenameParams(uriBefore, uriAfter))
        }
      }
    }
  }
}
