package com.sourcegraph.cody.autoedit

import com.intellij.openapi.Disposable
import com.intellij.openapi.editor.Document
import com.intellij.openapi.project.Project
import com.intellij.openapi.vcs.ex.LineStatusTrackerI
import com.intellij.openapi.vcs.ex.Range
import com.intellij.openapi.vfs.VirtualFile
import java.util.BitSet

class AutoeditTracker(
    override val project: Project,
    override val disposable: Disposable,
    override val document: Document,
    override val vcsDocument: Document,
    override val virtualFile: VirtualFile?,
    val range: Range
) : LineStatusTrackerI<Range> {

  override val isReleased: Boolean
    get() = TODO("Not yet implemented")

  override fun doFrozen(task: Runnable) {
    TODO("Not yet implemented")
  }

  override fun findRange(range: Range): Range? {
    TODO("Not yet implemented")
  }

  override fun getNextRange(line: Int): Range? {
    TODO("Not yet implemented")
  }

  override fun getPrevRange(line: Int): Range? {
    TODO("Not yet implemented")
  }

  override fun getRangeForLine(line: Int): Range? {
    TODO("Not yet implemented")
  }

  override fun getRanges() = listOf(range)

  override fun getRangesForLines(lines: BitSet): List<Range>? {
    TODO("Not yet implemented")
  }

  override fun isLineModified(line: Int): Boolean {
    TODO("Not yet implemented")
  }

  override fun isOperational(): Boolean {
    TODO("Not yet implemented")
  }

  override fun isRangeModified(startLine: Int, endLine: Int): Boolean {
    TODO("Not yet implemented")
  }

  override fun isValid() = true

  override fun <T> readLock(task: () -> T): T {
    TODO("Not yet implemented")
  }

  override fun rollbackChanges(range: Range) {
    TODO("Not yet implemented")
  }

  override fun rollbackChanges(lines: BitSet) {
    TODO("Not yet implemented")
  }

  override fun transferLineFromVcs(line: Int, approximate: Boolean): Int {
    TODO("Not yet implemented")
  }

  override fun transferLineToVcs(line: Int, approximate: Boolean): Int {
    TODO("Not yet implemented")
  }
}
