package com.sourcegraph.cody.ui.web

import com.intellij.openapi.diagnostic.Logger
import org.cef.browser.CefBrowser
import org.cef.handler.CefKeyboardHandler
import org.cef.handler.CefKeyboardHandler.CefKeyEvent
import org.cef.misc.BoolRef
import org.cef.misc.EventFlags.EVENTFLAG_SHIFT_DOWN
import java.awt.event.KeyEvent

class CustomKeyEventHandler : CefKeyboardHandler {

    val logger: Logger = Logger.getInstance(this.javaClass)

    override fun onPreKeyEvent(p0: CefBrowser?, p1: CefKeyboardHandler.CefKeyEvent?, p2: BoolRef?): Boolean {
        return true
    }

    override fun onKeyEvent(browser: CefBrowser?, event: CefKeyboardHandler.CefKeyEvent?): Boolean {
        event?.let {

            val isShiftPressed = (event.modifiers and EVENTFLAG_SHIFT_DOWN) != 0
            println("Key event: type=${event?.type}, code=${event?.unmodified_character?.code}, winCode=${it.windows_key_code} modifiers=${event?.modifiers}, Shift=${isShiftPressed}")

           // if (it.unmodified_character.code == 0) return true; // no key pressed, only modifiers key changed

            if (it.type == CefKeyEvent.EventType.KEYEVENT_KEYUP
                 || it.type == CefKeyEvent.EventType.KEYEVENT_RAWKEYDOWN)
                 {

                if (it.unmodified_character.code == KeyEvent.VK_BACK_SPACE) {
                    logger.warn("Backspace key was pressed!")
                    return true
                }

                if (it.windows_key_code == KeyEvent.VK_ENTER && isShiftPressed) {
                    logger.warn("Shift+Enter key was pressed!")

                    browser?.executeJavaScript("""
                      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', shiftKey: true, bubbles: true}));
                      document.activeElement.dispatchEvent(new KeyboardEvent('keypress', {key: 'Enter', code: 'Enter', shiftKey: true, bubbles: true}));
                      document.activeElement.dispatchEvent(new KeyboardEvent('keyup', {key: 'Enter', code: 'Enter', shiftKey: true, bubbles: true}));
                    """,
                        browser.url, 0)

                    return true
                }

                // Check if the key is Delete (typically keyCode 46)
                if (it.unmodified_character.code == KeyEvent.VK_DELETE) {
                    // Handle delete key press here
                    println("Delete key was pressed!")

                    browser?.executeJavaScript("""
                      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key: 'Delete', code: 'Delete', bubbles: true}));
                      document.activeElement.dispatchEvent(new KeyboardEvent('keypress', {key: 'Delete', code: 'Delete', bubbles: true}));
                      document.activeElement.dispatchEvent(new KeyboardEvent('keyup', {key: 'Delete', code: 'Delete', bubbles: true}));
                    """,
                        browser.url, 0)

                    return true
                }
            }
        }

        // Return false to let other keys be processed normally
        return false
    }
}
