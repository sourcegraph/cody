package com.sourcegraph.cody.ui

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.Logger
import com.intellij.util.ui.UIUtil
import com.sourcegraph.cody.edit.EditUtil
import com.sourcegraph.cody.edit.widget.component1
import com.sourcegraph.cody.edit.widget.component2
import java.awt.Component
import java.awt.Container
import java.awt.Cursor
import java.awt.Point
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.awt.event.MouseMotionAdapter
import javax.swing.JComponent
import javax.swing.JFrame
import javax.swing.SwingUtilities

// Provides undecorated JFrames with the ability to be moved and resized.
class FrameMover(private val frame: JFrame, private val titleBar: JComponent) : Disposable {
  private val logger = Logger.getInstance(FrameMover::class.java)

  private var resizeDirection = ResizeDirection.NONE
  private var lastMouseX = 0
  private var lastMouseY = 0

  // Debounce to mitigate jitter while dragging.
  private var lastUpdateTime = System.currentTimeMillis()

  private val frameMouseListener =
      object : MouseAdapter() {
        override fun mousePressed(e: MouseEvent) = handleMousePressed(e)

        override fun mouseReleased(e: MouseEvent) = handleMouseReleased()

        override fun mouseEntered(e: MouseEvent) = handleMouseEntered()

        override fun mouseExited(e: MouseEvent) = handleMouseExited()

        override fun mouseClicked(e: MouseEvent) = handleMouseClicked()
      }

  private val frameMouseMotionListener =
      object : MouseMotionAdapter() {
        override fun mouseMoved(e: MouseEvent) = handleMouseMoved(e)

        override fun mouseDragged(e: MouseEvent) = handleMouseDragged(e)
      }

  init {
    frame.addMouseListener(frameMouseListener)
    frame.addMouseMotionListener(frameMouseMotionListener)

    addForwardingListeners(titleBar)
  }

  private fun addForwardingListeners(component: Component) {
    if (component is JComponent) {
      component.addMouseListener(ForwardingAdapter(component))
      component.addMouseMotionListener(ForwardingAdapter(component))
    }
    if (component is Container) {
      component.components.forEach { addForwardingListeners(it) }
    }
  }

  private fun updateCursor() {
    frame.cursor =
        when (resizeDirection) {
          ResizeDirection.NORTH_WEST -> Cursor.getPredefinedCursor(Cursor.NW_RESIZE_CURSOR)
          ResizeDirection.NORTH -> Cursor.getPredefinedCursor(Cursor.N_RESIZE_CURSOR)
          ResizeDirection.NORTH_EAST -> Cursor.getPredefinedCursor(Cursor.NE_RESIZE_CURSOR)
          ResizeDirection.WEST -> Cursor.getPredefinedCursor(Cursor.W_RESIZE_CURSOR)
          ResizeDirection.EAST -> Cursor.getPredefinedCursor(Cursor.E_RESIZE_CURSOR)
          ResizeDirection.SOUTH_WEST -> Cursor.getPredefinedCursor(Cursor.SW_RESIZE_CURSOR)
          ResizeDirection.SOUTH -> Cursor.getPredefinedCursor(Cursor.S_RESIZE_CURSOR)
          ResizeDirection.SOUTH_EAST -> Cursor.getPredefinedCursor(Cursor.SE_RESIZE_CURSOR)
          else -> Cursor.getDefaultCursor()
        }
  }

  // See if the point, relative to our frame coordinates, is in a resize zone.
  private fun getResizeDirection(point: Point): ResizeDirection {
    val border = RESIZE_BORDER
    val (px, py) = point
    val w = frame.width
    val h = frame.height
    return when {
      px < border && py < border -> ResizeDirection.NORTH_WEST
      px < border && py >= h - border -> ResizeDirection.SOUTH_WEST
      px < border -> ResizeDirection.WEST
      px >= w - border && py < border -> ResizeDirection.NORTH_EAST
      px >= w - border && py >= h - border -> ResizeDirection.SOUTH_EAST
      px >= w - border -> ResizeDirection.EAST
      py < border -> ResizeDirection.NORTH
      py >= h - border -> ResizeDirection.SOUTH
      else -> ResizeDirection.NONE
    }.also { resizeDirection = it }
  }

  // These methods all take an event in the Frame's coordinate space.
  private fun handleMousePressed(e: MouseEvent) {
    resizeDirection = getResizeDirection(e.point)
    lastMouseX = e.xOnScreen
    lastMouseY = e.yOnScreen
    updateCursor()
  }

  private fun handleMouseReleased() {
    resizeDirection = ResizeDirection.NONE
    frame.cursor = Cursor.getDefaultCursor()
  }

  private fun handleMouseClicked() {}

  private fun handleMouseEntered() = updateCursor()

  private fun handleMouseExited() = updateCursor()

  private fun handleMouseMoved(e: MouseEvent) {
    resizeDirection = getResizeDirection(e.point)
    updateCursor()
  }

  private fun handleMouseDragged(e: MouseEvent) {
    if (resizeDirection != ResizeDirection.NONE) {
      resizeDialog(e)
      updateCursor()
    } else {
      moveDialog(e)
    }
  }

  private fun resizeDialog(e: MouseEvent) {
    val currentTime = System.currentTimeMillis()
    if (currentTime - lastUpdateTime <= 16) return

    val newX = e.xOnScreen
    val newY = e.yOnScreen
    val deltaX = newX - lastMouseX
    val deltaY = newY - lastMouseY

    var newWidth = frame.width
    var newHeight = frame.height
    val minimumSize = frame.minimumSize
    val x = frame.location.x
    val y = frame.location.y

    when (resizeDirection) {
      ResizeDirection.EAST,
      ResizeDirection.NORTH_EAST,
      ResizeDirection.SOUTH_EAST -> {
        newWidth = minimumSize.width.coerceAtLeast(frame.width + deltaX)
      }
      ResizeDirection.WEST,
      ResizeDirection.NORTH_WEST,
      ResizeDirection.SOUTH_WEST -> {
        newWidth = minimumSize.width.coerceAtLeast(frame.width - deltaX)
        frame.setLocation(x + deltaX, y)
      }
      else -> {}
    }
    when (resizeDirection) {
      ResizeDirection.SOUTH,
      ResizeDirection.SOUTH_EAST,
      ResizeDirection.SOUTH_WEST -> {
        newHeight = minimumSize.height.coerceAtLeast(frame.height + deltaY)
      }
      ResizeDirection.NORTH,
      ResizeDirection.NORTH_EAST,
      ResizeDirection.NORTH_WEST -> {
        newHeight = minimumSize.height.coerceAtLeast(frame.height - deltaY)
        frame.setLocation(x, y + deltaY)
      }
      else -> {}
    }

    SwingUtilities.invokeLater { frame.setSize(newWidth, newHeight) }
    lastMouseX = newX
    lastMouseY = newY
    lastUpdateTime = currentTime
  }

  private fun moveDialog(e: MouseEvent) {
    val currentTime = System.currentTimeMillis()
    if (currentTime - lastUpdateTime > 16) { // about 60 fps
      val x: Int = e.xOnScreen
      val y: Int = e.yOnScreen
      SwingUtilities.invokeLater {
        frame.rootPane?.let { rootPane ->
          UIUtil.getLocationOnScreen(rootPane)?.let { loc ->
            frame.setLocation(loc.x + x - lastMouseX, loc.y + y - lastMouseY)
            lastMouseX = x
            lastMouseY = y
          }
        }
      }
      lastUpdateTime = currentTime
    }
  }

  override fun dispose() {
    EditUtil.removeAllListeners(titleBar)
    frame.removeMouseListener(frameMouseListener)
    frame.removeMouseMotionListener(frameMouseMotionListener)
  }

  private enum class ResizeDirection {
    NORTH_WEST,
    NORTH,
    NORTH_EAST,
    WEST,
    EAST,
    SOUTH_WEST,
    SOUTH,
    SOUTH_EAST,
    NONE
  }

  private inner class ForwardingAdapter(val component: Component) : MouseAdapter() {
    override fun mousePressed(e: MouseEvent) = handleMousePressed(translate(e))

    override fun mouseMoved(e: MouseEvent) = handleMouseMoved(translate(e))

    override fun mouseDragged(e: MouseEvent) = handleMouseDragged(translate(e))

    override fun mouseEntered(e: MouseEvent) = handleMouseEntered()

    override fun mouseExited(e: MouseEvent) = handleMouseExited()

    override fun mouseClicked(e: MouseEvent) = handleMouseClicked()

    override fun mouseReleased(e: MouseEvent) = handleMouseReleased()

    private fun translate(e: MouseEvent) = SwingUtilities.convertMouseEvent(component, e, frame)
  }

  companion object {
    private const val RESIZE_BORDER = 6
  }
}
