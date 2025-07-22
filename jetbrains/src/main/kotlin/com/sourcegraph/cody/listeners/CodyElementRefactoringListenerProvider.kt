package com.sourcegraph.cody.listeners

import com.intellij.psi.PsiElement
import com.intellij.refactoring.listeners.RefactoringElementListener
import com.intellij.refactoring.listeners.RefactoringElementListenerProvider
import com.sourcegraph.cody.agent.CodyAgentService.Companion.withAgent
import com.sourcegraph.cody.agent.protocol_extensions.ProtocolTextDocumentExt.vscNormalizedUriFor
import com.sourcegraph.cody.agent.protocol_generated.TextDocument_DidRenameParams

class CodyElementListenerProvider : RefactoringElementListenerProvider {
  override fun getListener(element: PsiElement): RefactoringElementListener {

    return object : RefactoringElementListener {
      val uriBefore = getContainingFileUri(element)

      override fun elementMoved(newPsiElement: PsiElement) = notifyAgent(newPsiElement)

      override fun elementRenamed(newPsiElement: PsiElement) = notifyAgent(newPsiElement)

      private fun getContainingFileUri(element: PsiElement): String? {
        if (element.containingFile.virtualFile == null) {
          return null
        }
        return vscNormalizedUriFor(element.containingFile.virtualFile)
      }

      private fun notifyAgent(newPsiElement: PsiElement) {
        val uriAfter = getContainingFileUri(newPsiElement)
        if (uriBefore == null || uriAfter == null || uriBefore == uriAfter) {
          return
        }
        withAgent(element.project) { agent ->
          agent.server.textDocument_didRename(TextDocument_DidRenameParams(uriBefore, uriAfter))
        }
      }
    }
  }
}
