package com.sourcegraph.common

import com.intellij.diff.DiffContentFactory
import com.intellij.diff.DiffRequestFactory
import com.intellij.diff.actions.BlankDiffWindowUtil.createBlankDiffRequestChain
import com.intellij.diff.actions.CompareFileWithEditorAction
import com.intellij.diff.chains.DiffRequestChain
import com.intellij.diff.contents.FileContent
import com.intellij.diff.util.DiffUserDataKeys
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager

class ShowDocumentDiffAction(
    private val documentBefore: Document,
    private val documentAfter: Document
) : CompareFileWithEditorAction() {
  override fun isAvailable(e: AnActionEvent): Boolean {
    return true
  }

  override fun getDiffRequestChain(e: AnActionEvent): DiffRequestChain {
    val project = e.project ?: throw IllegalStateException("Project cannot be null")

    val rhsContent = DiffContentFactory.getInstance().create(project, documentAfter)
    val fileType = (rhsContent as? FileContent)?.file?.fileType

    val lhsContent = DiffContentFactory.getInstance().create(project, documentBefore, fileType)
    lhsContent.putUserData(DiffUserDataKeys.FORCE_READ_ONLY, true)

    val editorFile = FileDocumentManager.getInstance().getFile(documentAfter)
    val editorContentTitle =
        when {
          editorFile == null -> "Editor"
          else -> DiffRequestFactory.getInstance().getContentTitle(editorFile)
        }

    val chain = createBlankDiffRequestChain(lhsContent, rhsContent, baseContent = null)
    chain.windowTitle =
        when {
          editorFile == null -> "Cody Diff"
          else -> "Cody Diff: $editorContentTitle"
        }
    chain.title1 = "Before"
    chain.title2 = editorContentTitle

    return chain
  }
}
