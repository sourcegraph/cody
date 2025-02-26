package com.sourcegraph.cody.ui.web

import org.cef.browser.CefBrowser
import org.cef.handler.CefKeyboardHandler
import org.cef.misc.BoolRef
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
        return true;
    }

    override fun onKeyEvent(p0: CefBrowser?, p1: CefKeyboardHandler.CefKeyEvent?): Boolean {
        return true;
    }
}
