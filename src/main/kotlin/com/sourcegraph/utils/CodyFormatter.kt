package com.sourcegraph.utils

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiFileFactory
import com.intellij.psi.codeStyle.CodeStyleManager
import kotlin.math.max
import kotlin.math.min

class CodyFormatter {
  companion object {
    private val logger = Logger.getInstance(CodyFormatter::class.java)

    /**
     * Formatting used to format inlay text inserted by Cody, based on the surrounding code style in
     * the document.
     */
    fun formatStringBasedOnDocument(
        completionText: String,
        project: Project,
        document: Document,
        range: TextRange,
        cursor: Int
    ): String {
      try {
        val beforeCompletion = document.text.substring(0, range.startOffset)
        val afterCompletion = document.text.substring(range.endOffset)
        val contentWithCompletion = beforeCompletion + completionText + afterCompletion

        val file = FileDocumentManager.getInstance().getFile(document) ?: return completionText
        val psiFile =
            PsiFileFactory.getInstance(project)
                .createFileFromText("TEMP", file.fileType, contentWithCompletion)

        val codeStyleManager = CodeStyleManager.getInstance(project)
        val endOffset = max(cursor, range.startOffset + completionText.length)
        codeStyleManager.reformatText(psiFile, cursor, endOffset)

        // Fix for the IJ formatting bug which removes spaces even before the given formatting
        // range.
        val existingStart = contentWithCompletion.substring(0, cursor)
        val boundedCursorPosition = min(cursor, psiFile.text.length)
        val formattedStart = psiFile.text.substring(0, boundedCursorPosition)
        val startOfDiff = existingStart.zip(formattedStart).indexOfFirst { (e, f) -> e != f }

        val formattedText =
            if (startOfDiff != -1) {
              val addition = formattedStart.substring(startOfDiff)
              existingStart + addition + psiFile.text.substring(boundedCursorPosition)
            } else psiFile.text
        return formattedText.substring(
            range.startOffset, range.endOffset + formattedText.length - document.textLength)
      } catch (e: Exception) {
        logger.error("Failed to format code snippet", e)
        return completionText
      }
    }
  }
}
