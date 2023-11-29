package com.sourcegraph.cody.agent;

import com.sourcegraph.cody.agent.protocol.TextDocument;
import java.net.URI;
import java.util.HashMap;
import java.util.Map;

// Work-in-progress implementation of a helper class to optimize the notification traffic for
// textDocument/* methods. For example, we don't need to include the content of the document
// when we move the cursor around, or we don't need to send repeated didFocus events for the
// same file path. Currently, we send duplicate didFocus events when the user focuses on
// another application than IntelliJ, and then focuses back on the original document.
public class CodyAgentDocuments {
  private final CodyAgentServer underlying;
  private URI focusedPath = null;
  private Map<URI, TextDocument> documents = new HashMap<>();

  public CodyAgentDocuments(CodyAgentServer underlying) {
    this.underlying = underlying;
  }

  private void handleDocument(TextDocument document) {
    TextDocument old = this.documents.get(document.getUri());
    if (old == null) {
      this.documents.put(document.getUri(), document);
      return;
    }
    if (document.getContent() == null) {
      document.setContent(old.getContent());
    }
    if (document.getSelection() == null) {
      document.setSelection(old.getSelection());
    }
    this.documents.put(document.getUri(), document);
  }

  public void didOpen(TextDocument document) {
    this.documents.put(document.getUri(), document);
    underlying.textDocumentDidOpen(document);
  }

  public void didFocus(TextDocument document) {
    this.documents.put(document.getUri(), document);
  }

  public void didChange(TextDocument document) {}

  public void didClose(TextDocument document) {}
}
