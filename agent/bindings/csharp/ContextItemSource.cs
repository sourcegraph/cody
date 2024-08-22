using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  public enum ContextItemSource
  {
    [JsonPropertyName("embeddings")]
    Embeddings,
    [JsonPropertyName("user")]
    User,
    [JsonPropertyName("editor")]
    Editor,
    [JsonPropertyName("search")]
    Search,
    [JsonPropertyName("initial")]
    Initial,
    [JsonPropertyName("unified")]
    Unified,
    [JsonPropertyName("selection")]
    Selection,
    [JsonPropertyName("terminal")]
    Terminal,
    [JsonPropertyName("uri")]
    Uri,
    [JsonPropertyName("history")]
    History,
  }
}
