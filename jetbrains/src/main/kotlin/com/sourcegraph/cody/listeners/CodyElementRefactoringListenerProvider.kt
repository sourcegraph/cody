package com.sourcegraph.cody.listeners

import com.intellij.psi.PsiElement
import com.intellij.refactoring.listeners.RefactoringElementListener
import com.intellij.refactoring.listeners.RefactoringElementListenerProvider
import com.sourcegraph.cody.agent.CodyAgentService.Companion.withServer

class CodyElementListenerProvider : RefactoringElementListenerProvider {
  override fun getListener(element: PsiElement) =
      object : RefactoringElementListener {
        override fun elementMoved(p0: PsiElement) {
          val virtualFileBefore = element.containingFile.virtualFile
          val virtualFileAfter = p0.containingFile.virtualFile
          withServer(element.project) { server ->
            println("elementMoved from $virtualFileBefore to $virtualFileAfter")
          }
        }

        override fun elementRenamed(p0: PsiElement) {
          val virtualFileBefore = element.containingFile.virtualFile
          val virtualFileAfter = p0.containingFile.virtualFile
          withServer(element.project) { server ->
            println("elementRenamed from $virtualFileBefore to $virtualFileAfter")
          }
        }
      }
}
