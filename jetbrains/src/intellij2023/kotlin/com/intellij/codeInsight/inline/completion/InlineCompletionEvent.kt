// Copyright 2000-2023 JetBrains s.r.o. and contributors. Use of this source code is governed by the
// Apache 2.0 license.
package com.intellij.codeInsight.inline.completion

import com.intellij.codeInsight.lookup.LookupElement
import com.intellij.codeInsight.lookup.LookupEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.editor.Caret
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFile
import com.intellij.psi.impl.source.PsiFileImpl
import com.intellij.psi.util.PsiUtilBase
import com.intellij.util.concurrency.annotations.RequiresBlockingContext

class InlineCompletionRequest(
    val event: InlineCompletionEvent,
    val file: PsiFile,
    val editor: Editor,
    val document: Document,
    val startOffset: Int,
    val endOffset: Int,
    val lookupElement: LookupElement? = null,
) : UserDataHolderBase()

/**
 * Be aware that creating your own event is unsafe for a while and might face compatibility issues
 */
interface InlineCompletionEvent {

  @RequiresBlockingContext fun toRequest(): InlineCompletionRequest?

  /** A class representing a direct call in the code editor by [InsertInlineCompletionAction]. */
  class DirectCall(
      val editor: Editor,
      val caret: Caret,
      val context: DataContext? = null,
  ) : InlineCompletionEvent {
    override fun toRequest(): InlineCompletionRequest? {
      val offset = runReadAction { caret.offset }
      val project = editor.project ?: return null
      val file = getPsiFile(caret, project) ?: return null
      return InlineCompletionRequest(this, file, editor, editor.document, offset, offset)
    }
  }

  sealed interface InlineLookupEvent : InlineCompletionEvent {
    val event: LookupEvent

    override fun toRequest(): InlineCompletionRequest? {
      val editor = runReadAction { event.lookup?.editor } ?: return null
      val caretModel = editor.caretModel
      if (caretModel.caretCount != 1) return null

      val project = editor.project ?: return null

      val (file, offset) =
          runReadAction { getPsiFile(caretModel.currentCaret, project) to caretModel.offset }
      if (file == null) return null

      return InlineCompletionRequest(
          this, file, editor, editor.document, offset, offset, event.item)
    }
  }
}

@RequiresBlockingContext
private fun getPsiFile(caret: Caret, project: Project): PsiFile? {
  return runReadAction {
    val file =
        PsiDocumentManager.getInstance(project).getPsiFile(caret.editor.document)
            ?: return@runReadAction null
    // * [PsiUtilBase] takes into account injected [PsiFile] (like in Jupyter Notebooks)
    // * However, it loads a file into the memory, which is expensive
    // * Some tests forbid loading a file when tearing down
    // * On tearing down, Lookup Cancellation happens, which causes the event
    // * Existence of [treeElement] guarantees that it's in the memory
    if (file.isLoadedInMemory()) {
      PsiUtilBase.getPsiFileInEditor(caret, project)
    } else {
      file
    }
  }
}

private fun PsiFile.isLoadedInMemory(): Boolean {
  return (this as? PsiFileImpl)?.treeElement != null
}
