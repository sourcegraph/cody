package com.sourcegraph.cody.autoedit

import com.intellij.openapi.Disposable
import com.intellij.openapi.editor.Document
import com.intellij.openapi.project.Project
import com.intellij.openapi.vcs.ex.LineStatusTrackerI
import com.intellij.openapi.vcs.ex.Range
import com.intellij.openapi.vfs.VirtualFile
import java.util.BitSet

/**
 * We are using this LineStatusTrackerI API to effectively use
 * [AutoeditLineStatusMarkerPopupRenderer] and [AutoeditLineStatusMarkerPopupPanel]. Most of these
 * methods are not needed and are not used in our implementation.
 */
class AutoeditTracker(
    override val project: Project,
    override val disposable: Disposable,
    override val document: Document,
    override val vcsDocument: Document,
    override val virtualFile: VirtualFile?,
    val range: Range
) : LineStatusTrackerI<Range> {

  override val isReleased: Boolean
    get() = throw UnsupportedOperationException()

  override fun doFrozen(task: Runnable) {
    throw UnsupportedOperationException()
  }

  override fun findRange(range: Range): Range? {
    throw UnsupportedOperationException()
  }

  override fun getNextRange(line: Int): Range? {
    throw UnsupportedOperationException()
  }

  override fun getPrevRange(line: Int): Range? {
    throw UnsupportedOperationException()
  }

  override fun getRangeForLine(line: Int): Range? {
    throw UnsupportedOperationException()
  }

  override fun getRanges() = listOf(range)

  override fun getRangesForLines(lines: BitSet): List<Range>? {
    throw UnsupportedOperationException()
  }

  override fun isLineModified(line: Int): Boolean {
    throw UnsupportedOperationException()
  }

  override fun isOperational(): Boolean {
    throw UnsupportedOperationException()
  }

  override fun isRangeModified(startLine: Int, endLine: Int): Boolean {
    throw UnsupportedOperationException()
  }

  override fun isValid() = true

  override fun <T> readLock(task: () -> T): T {
    throw UnsupportedOperationException()
  }

  override fun rollbackChanges(range: Range) {
    throw UnsupportedOperationException()
  }

  override fun rollbackChanges(lines: BitSet) {
    throw UnsupportedOperationException()
  }

  override fun transferLineFromVcs(line: Int, approximate: Boolean): Int {
    throw UnsupportedOperationException()
  }

  override fun transferLineToVcs(line: Int, approximate: Boolean): Int {
    throw UnsupportedOperationException()
  }
}
