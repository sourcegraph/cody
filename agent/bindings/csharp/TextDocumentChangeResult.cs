using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TextDocumentChangeResult
  {
    [JsonProperty(PropertyName = "success")]
    public bool Success { get; set; }
  }
}
