using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TextDocumentDidFocusParams
  {

    [JsonPropertyName("uri")]
    public string Uri { get; set; }
  }
}
