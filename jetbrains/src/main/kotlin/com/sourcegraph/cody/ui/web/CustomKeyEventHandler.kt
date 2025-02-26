package com.sourcegraph.cody.ui.web

import org.cef.browser.CefBrowser
import org.cef.handler.CefKeyboardHandler
import org.cef.misc.BoolRef
import org.cef.handler.CefKeyboardHandler.CefKeyEvent
import java.awt.event.KeyEvent

class CustomKeyEventHandler : CefKeyboardHandler {
//    override fun onPreKeyEvent(browser: CefBrowser?, event: CefKeyboardHandler.CefKeyEvent?, p2: BoolRef?): Boolean {
//        if (event?.windows_key_code == KeyEvent.VK_BACK_SPACE) {
//            return false // Let the event pass through to the WebView
//        }
//        return false
//    }
    //    override fun onKeyEvent(browser: CefBrowser?, event: CefKeyboardHandler.CefKeyEvent?): Boolean {
//        if (event != null && event.windows_key_code.equals(KeyEvent.VK_BACK_SPACE)) {
//            return false // Let the event pass through to the WebView
//        }
//        return true
//    }
    override fun onPreKeyEvent(p0: CefBrowser?, p1: CefKeyboardHandler.CefKeyEvent?, p2: BoolRef?): Boolean {
        return true
    }

    override fun onKeyEvent(browser: CefBrowser?, event: CefKeyboardHandler.CefKeyEvent?): Boolean {
        // Check if the event is not null
        event?.let {
            // Check if it's a keypress event (not release)
            if (it.type == CefKeyEvent.EventType.KEYEVENT_KEYUP) {

                // Check if the key is Delete (typically keyCode 46)
                if (it.windows_key_code == 46) {
                    // Handle delete key press here
                    println("Delete key was pressed!")
                    // Return true to indicate we've handled this key

//                    browser?.executeJavaScript(
////                        "document.dispatchEvent(new KeyboardEvent('keyup', {keyCode: 46}));",
//                        "document.activeElement.dispatchEvent(new KeyboardEvent('keyup', {key: 'Delete', code: 'Delete'}));",
//                        browser.url,
//                        0
//                    )

                    browser?.executeJavaScript("""
                    const el = document.activeElement;
                    el.dispatchEvent(new KeyboardEvent('keydown', {key: 'Delete', code: 'Delete'}));
                    el.dispatchEvent(new KeyboardEvent('keyup', {key: 'Delete', code: 'Delete'}));
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
