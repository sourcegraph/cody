using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TextDocumentDidSaveParams
  {
    [JsonProperty(PropertyName = "uri")]
    public string Uri { get; set; }
  }
}
