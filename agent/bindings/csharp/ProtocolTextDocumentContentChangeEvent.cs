using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProtocolTextDocumentContentChangeEvent
  {

    [JsonPropertyName("range")]
    public Range Range { get; set; }

    [JsonPropertyName("text")]
    public string Text { get; set; }
  }
}
