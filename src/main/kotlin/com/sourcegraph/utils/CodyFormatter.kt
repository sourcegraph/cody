package com.sourcegraph.utils

import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFileFactory
import com.intellij.psi.codeStyle.CodeStyleManager
import com.intellij.refactoring.suggested.endOffset

class CodyFormatter {
  companion object {
    /**
     * Formatting used to format inlay text inserted by Cody, based on the surrounding code style in
     * the document.
     */
    fun formatStringBasedOnDocument(
        originalText: String,
        project: Project,
        document: Document,
        offset: Int
    ): String {

      val appendedString =
          document.text.substring(0, offset) + originalText + document.text.substring(offset)

      val file = FileDocumentManager.getInstance().getFile(document)!!
      val psiFile =
          PsiFileFactory.getInstance(project)
              .createFileFromText("TEMP", file.fileType, appendedString)

      val codeStyleManager = CodeStyleManager.getInstance(project)

      var i = offset
      var startRefactoringPosition = offset
      while ((document.text.elementAt(i - 1) == ' ' ||
          document.text.elementAt(i - 1) == '\n' ||
          document.text.elementAt(i - 1) == '\t') && i > 0) {
        startRefactoringPosition = i
        i--
      }
      var endOffset = offset + psiFile.endOffset - document.textLength
      codeStyleManager.reformatText(psiFile, startRefactoringPosition, endOffset)
      endOffset = offset + psiFile.endOffset - document.textLength
      return psiFile.text.substring(startRefactoringPosition, endOffset)
    }
  }
}
