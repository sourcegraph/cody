package com.sourcegraph.cody.edit.widget

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorCustomElementRenderer
import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.colors.EditorFontType
import com.intellij.openapi.editor.event.EditorMouseEvent
import com.intellij.openapi.editor.event.EditorMouseListener
import com.intellij.openapi.editor.event.EditorMouseMotionListener
import com.intellij.openapi.editor.impl.EditorImpl
import com.intellij.openapi.editor.impl.FontInfo
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.openapi.util.Disposer
import com.intellij.ui.Gray
import com.sourcegraph.cody.agent.protocol.Range
import com.sourcegraph.cody.edit.FixupSession
import java.awt.*
import java.awt.geom.Rectangle2D
import java.util.concurrent.atomic.AtomicBoolean

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

  val widgets = mutableListOf<LensWidget>()

  private lateinit var commandCallbacks: Map<String, () -> Unit>

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
      with(editor.colorsScheme.getFont(EditorFontType.PLAIN)) { Font(name, style, size - 2) }

  // Compute inlay height based on the widget font, not the editor font.
  private val inlayHeight =
      FontInfo.getFontMetrics(
              Font(
                  editor.colorsScheme.fontPreferences.fontFamily,
                  widgetFont.style,
                  widgetFont.size),
              FontInfo.getFontRenderContext(editor.contentComponent))
          .height

  private var widgetFontMetrics: FontMetrics? = null

  private var lastHoveredWidget: LensWidget? = null // Used for mouse rollover highlighting.

  var inlay: Inlay<EditorCustomElementRenderer>? = null

  private var prevCursor: Cursor? = null

  init {
    Disposer.register(session, this)
    editor.addEditorMouseListener(mouseClickListener)
    editor.addEditorMouseMotionListener(mouseMotionListener)
  }

  fun withListenersMuted(block: () -> Unit) {
    try {
      listenersMuted = true
      block()
    } finally {
      listenersMuted = false
    }
  }

  fun show(range: Range) {
    commandCallbacks = session.commandCallbacks()
    val offset = range.start.toOffset(editor.document)
    ApplicationManager.getApplication().invokeLater {
      if (!isDisposed.get()) {
        inlay = editor.inlayModel.addBlockElement(offset, false, true, 0, this)
        Disposer.register(this, inlay!!)
      }
    }
  }

  // Propagate repaint requests from widgets to the inlay.
  fun update() {
    inlay?.update()
  }

  override fun calcWidthInPixels(inlay: Inlay<*>): Int {
    // We create widgets for everything including separators; sum their widths.
    // N.B. This method is never called; I suspect the inlay takes the whole line.
    val fontMetrics = widgetFontMetrics ?: editor.getFontMetrics(Font.PLAIN)
    return widgets.sumOf { it.calcWidthInPixels(fontMetrics) }
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
    g.color = lensColor
    if (widgetFontMetrics == null) { // Cache for hit box detection later.
      widgetFontMetrics = g.fontMetrics
    }
    val top = targetRegion.y.toFloat()
    // Draw all the widgets left to right, keeping track of their width.
    widgets.fold(targetRegion.x.toFloat()) { acc, widget ->
      try {
        widget.paint(g, acc, top)
        acc + widget.calcWidthInPixels(g.fontMetrics)
      } finally {
        g.font = widgetFont // In case widget changed it.
      }
    }
  }

  private fun findWidgetAt(x: Int, y: Int): LensWidget? {
    var currentX = 0f // Widgets are left-aligned in the editor.
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
    if (findWidgetAt(x, y)?.onClick(x, y) == true) {
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
    isDisposed.set(true)
    if (editor.isDisposed) return
    editor.removeEditorMouseListener(mouseClickListener)
    editor.removeEditorMouseMotionListener(mouseMotionListener)
    disposeInlay()
  }

  private fun disposeInlay() {
    inlay?.apply {
      if (isValid) {
        Disposer.dispose(this)
      }
      inlay = null
    }
  }

  companion object {
    private val lensColor = Gray._150
  }
}
