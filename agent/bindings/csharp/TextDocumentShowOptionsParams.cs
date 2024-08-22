using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TextDocumentShowOptionsParams
  {

    [JsonPropertyName("preserveFocus")]
    public bool PreserveFocus { get; set; }

    [JsonPropertyName("preview")]
    public bool Preview { get; set; }

    [JsonPropertyName("selection")]
    public Range Selection { get; set; }
  }
}
