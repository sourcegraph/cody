package com.sourcegraph.cody.edit.widget

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorCustomElementRenderer
import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.LogicalPosition
import com.intellij.openapi.editor.ScrollType
import com.intellij.openapi.editor.colors.EditorFontType
import com.intellij.openapi.editor.event.EditorMouseEvent
import com.intellij.openapi.editor.event.EditorMouseListener
import com.intellij.openapi.editor.event.EditorMouseMotionListener
import com.intellij.openapi.editor.impl.EditorImpl
import com.intellij.openapi.editor.impl.FontInfo
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.openapi.util.Disposer
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.agent.protocol.Range
import com.sourcegraph.cody.edit.EditCommandPrompt
import com.sourcegraph.cody.edit.sessions.FixupSession
import com.sourcegraph.config.ThemeUtil
import java.awt.Cursor
import java.awt.Font
import java.awt.FontMetrics
import java.awt.Graphics2D
import java.awt.Point
import java.awt.geom.Rectangle2D
import java.util.concurrent.CompletableFuture
import java.util.concurrent.atomic.AtomicBoolean
import java.util.function.Supplier
import kotlin.math.roundToInt
import org.jetbrains.annotations.NotNull

operator fun Point.component1() = this.x

operator fun Point.component2() = this.y

/**
 * Manages a single code lens group. It should only be displayed once, and disposed after displaying
 * it, before displaying another.
 */
class LensWidgetGroup(val session: FixupSession, parentComponent: Editor) :
    EditorCustomElementRenderer, Disposable {
  private val logger = Logger.getInstance(LensWidgetGroup::class.java)
  val editor = parentComponent as EditorImpl

  val isDisposed = AtomicBoolean(false)
  private val addedListeners = AtomicBoolean(false)
  private val removedListeners = AtomicBoolean(false)

  val widgets = mutableListOf<LensWidget>()

  private val mouseClickListener =
      object : EditorMouseListener {
        override fun mouseClicked(e: EditorMouseEvent) {
          if (!listenersMuted) {
            handleMouseClick(e)
          }
        }
      }
  private val mouseMotionListener =
      object : EditorMouseMotionListener {
        override fun mouseMoved(e: EditorMouseEvent) {
          if (!listenersMuted) {
            handleMouseMove(e)
          }
        }
      }

  private var listenersMuted = false

  val widgetFont =
      with(editor.colorsScheme.getFont(EditorFontType.PLAIN)) { Font(name, style, size) }

  // Compute inlay height based on the widget font, not the editor font.
  private val inlayHeight =
      FontInfo.getFontMetrics(
              Font(
                  editor.colorsScheme.fontPreferences.fontFamily,
                  widgetFont.style,
                  widgetFont.size),
              FontInfo.getFontRenderContext(editor.contentComponent))
          .height + VERTICAL_PADDING

  private var widgetFontMetrics: FontMetrics? = null

  private var lastHoveredWidget: LensWidget? = null // Used for mouse rollover highlighting.

  var inlay: Inlay<EditorCustomElementRenderer>? = null

  private var prevCursor: Cursor? = null

  var isAcceptGroup = false
  var isErrorGroup = false

  init {
    Disposer.register(session, this)
    editor.addEditorMouseListener(mouseClickListener)
    editor.addEditorMouseMotionListener(mouseMotionListener)
    addedListeners.set(true)
  }

  fun withListenersMuted(block: () -> Unit) {
    try {
      listenersMuted = true
      block()
    } finally {
      listenersMuted = false
    }
  }

  fun show(range: Range): CompletableFuture<Boolean> {
    val offset = range.start.toOffset(editor.document)
    return onEventThread {
      if (isDisposed.get()) {
        throw IllegalStateException("Request to show disposed inlay: $this")
      }
      inlay = editor.inlayModel.addBlockElement(offset, false, true, 0, this)
      Disposer.register(this, inlay!!)
      // Make sure the lens is visible.
      val logicalPosition = LogicalPosition(range.start.line, range.start.character)
      editor.scrollingModel.scrollTo(logicalPosition, ScrollType.CENTER)
      true
    }
  }

  // Propagate repaint requests from widgets to the inlay.
  fun update() {
    inlay?.update()
  }

  override fun calcWidthInPixels(inlay: Inlay<*>): Int {
    return editor.component.width
  }

  override fun calcHeightInPixels(inlay: Inlay<*>): Int {
    return inlayHeight
  }

  private fun widgetGroupXY(): Point {
    return editor.offsetToXY(inlay?.offset ?: return Point(0, 0))
  }

  fun widgetXY(widget: LensWidget): Point {
    val ourXY = widgetGroupXY()
    val fontMetrics = widgetFontMetrics ?: editor.getFontMetrics(Font.PLAIN)
    var sum = 0
    for (w in widgets) {
      if (w == widget) break
      sum += w.calcWidthInPixels(fontMetrics)
    }
    return Point(ourXY.x + sum, ourXY.y)
  }

  override fun paint(
      inlay: Inlay<*>,
      g: Graphics2D,
      targetRegion: Rectangle2D,
      textAttributes: TextAttributes
  ) {
    g.font = widgetFont
    if (widgetFontMetrics == null) { // Cache for hit box detection later.
      widgetFontMetrics = g.fontMetrics
    }

    val top = targetRegion.y + VERTICAL_PADDING / 2
    val left = targetRegion.x + LEFT_MARGIN

    // Draw the inlay background across the width of the Editor.
    g.color =
        EditCommandPrompt.textFieldBackground().run {
          if (ThemeUtil.isDarkTheme()) darker() else this
        }
    g.fillRect(
        targetRegion.x.roundToInt(),
        top.roundToInt(),
        calcWidthInPixels(inlay),
        calcHeightInPixels(inlay))

    // Draw all the widgets left to right, keeping track of their width.
    widgets.fold(left) { acc, widget ->
      try {
        widget.paint(g, acc.toFloat(), top.toFloat() + 4)
        acc + widget.calcWidthInPixels(g.fontMetrics)
      } finally {
        g.font = widgetFont // In case widget changed it.
      }
    }
  }

  private fun findWidgetAt(x: Int, y: Int): LensWidget? {
    var currentX = LEFT_MARGIN
    val fontMetrics = widgetFontMetrics ?: return null
    // Make sure it's in our bounds.
    if (inlay?.bounds?.contains(x, y) == false) return null
    // Walk widgets left to right checking their hit boxes.
    for (widget in widgets) {
      val widgetWidth = widget.calcWidthInPixels(fontMetrics)
      val rightEdgeX = currentX + widgetWidth
      if (x >= currentX && x <= rightEdgeX) { // In widget's bounds?
        return widget
      }
      currentX = rightEdgeX
      // Add to currentX here to increase spacing.
    }
    return null
  }

  fun addWidget(widget: LensWidget) {
    widgets.add(widget)
  }

  fun registerWidgets() {
    widgets.forEach { Disposer.register(this, it) }
  }

  // Dispatch mouse click events to the appropriate widget.
  private fun handleMouseClick(e: EditorMouseEvent) {
    val (x, y) = e.mouseEvent.point
    if (findWidgetAt(x, y)?.onClick(e) == true) {
      e.consume()
    }
  }

  private fun handleMouseMove(e: EditorMouseEvent) {
    val (x, y) = e.mouseEvent.point
    val widget = findWidgetAt(x, y)
    val lastWidget = lastHoveredWidget

    if (widget is LensAction) {
      prevCursor = e.editor.contentComponent.cursor
      e.editor.contentComponent.cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
    } else {
      if (prevCursor != null) {
        e.editor.contentComponent.cursor = prevCursor!!
        prevCursor = null
      }
    }

    // Check if the mouse has moved from one widget to another or from/to outside
    if (widget != lastWidget) {
      lastWidget?.onMouseExit(e)
      lastHoveredWidget = widget // null if now outside
      widget?.onMouseEnter(e)
      inlay?.update() // force repaint
    }
  }

  /** Immediately hides and discards this inlay and widget group. */
  override fun dispose() {
    // We work extra hard to ensure this method is idempotent and robust,
    // because IntelliJ (annoyingly) logs an assertion if you try to remove
    // a nonexistent listener, and it pops up a user-visible exception.
    if (isDisposed.get()) return
    isDisposed.set(true)
    if (editor.isDisposed) return
    onEventThread {
      if (editor.isDisposed) return@onEventThread
      if (addedListeners.get() && !removedListeners.get()) {
        try {
          removedListeners.set(true)
          editor.removeEditorMouseListener(mouseClickListener)
          editor.removeEditorMouseMotionListener(mouseMotionListener)
        } catch (t: Throwable) {
          logger.warn("Error removing mouse listeners", t)
        }
      }
      try {
        disposeInlay()
      } catch (t: Throwable) {
        logger.warn("Error disposing inlay", t)
      }
    }
  }

  @RequiresEdt
  private fun disposeInlay() {
    inlay?.apply {
      if (isValid) {
        Disposer.dispose(this)
      }
      inlay = null
    }
  }

  private fun <T> onEventThread(handler: Supplier<T>): @NotNull CompletableFuture<T> {
    val result = CompletableFuture<T>()
    val executeAndComplete: () -> Unit = {
      try {
        result.complete(handler.get())
      } catch (e: Exception) {
        result.completeExceptionally(e)
      }
    }
    if (ApplicationManager.getApplication().isDispatchThread) {
      executeAndComplete()
    } else {
      ApplicationManager.getApplication().invokeLater { executeAndComplete() }
    }
    return result
  }

  override fun toString(): String {
    val render = widgets.joinToString(separator = ",") { it.toString() }
    return "LensWidgetGroup: {$render}"
  }

  companion object {
    private const val LEFT_MARGIN = 100f
    const val VERTICAL_PADDING = 8
  }
}
