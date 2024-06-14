package com.sourcegraph.cody.vscode;

import com.sourcegraph.cody.agent.protocol.Position;
import com.sourcegraph.cody.agent.protocol.Range;
import java.net.URI;
import java.util.Optional;
import org.jetbrains.annotations.NotNull;

public interface TextDocument {
  URI uri();

  @NotNull
  String fileName();

  int offsetAt(Position position);

  String getText();

  String getText(Range range);

  Position positionAt(int offset);

  @NotNull
  Optional<String> getLanguageId();
}
