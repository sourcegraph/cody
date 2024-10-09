using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TextDocumentShowParams
  {
    [JsonProperty(PropertyName = "uri")]
    public string Uri { get; set; }
    [JsonProperty(PropertyName = "options")]
    public TextDocumentShowOptionsParams Options { get; set; }
  }
}
