using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TextDocumentShowParams
  {

    [JsonPropertyName("uri")]
    public string Uri { get; set; }

    [JsonPropertyName("options")]
    public TextDocumentShowOptionsParams Options { get; set; }
  }
}
