package com.sourcegraph.find.browser;

import com.intellij.ui.jcef.JBCefBrowser;
import org.cef.CefApp;
import org.cef.browser.CefBrowser;
import org.cef.handler.CefLifeSpanHandlerAdapter;
import org.jetbrains.annotations.NotNull;

public class SourcegraphJBCefBrowser extends JBCefBrowser {
  public SourcegraphJBCefBrowser(
      @NotNull JSToJavaBridgeRequestHandler requestHandler, String endpointUrl) {
    super(endpointUrl.replaceAll("/+$", "").replace("https://", "http://") + "/html/index.html");

    // Schema registration need to happen in a callback, or it may crash in IJ 2023.2:
    // https://youtrack.jetbrains.com/issue/JBR-5853
    CefLifeSpanHandlerAdapter lifeSpanHandler =
        new CefLifeSpanHandlerAdapter() {
          public void onAfterCreated(CefBrowser browser) {
            CefApp.getInstance()
                .registerSchemeHandlerFactory("http", null, new HttpSchemeHandlerFactory());
          }
        };

    this.getJBCefClient().addLifeSpanHandler(lifeSpanHandler, this.getCefBrowser());
  }
}
