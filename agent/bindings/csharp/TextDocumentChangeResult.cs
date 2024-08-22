using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TextDocumentChangeResult
  {

    [JsonPropertyName("success")]
    public bool Success { get; set; }
  }
}
