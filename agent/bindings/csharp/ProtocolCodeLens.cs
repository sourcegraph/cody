using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProtocolCodeLens
  {

    [JsonPropertyName("range")]
    public Range Range { get; set; }

    [JsonPropertyName("command")]
    public ProtocolCommand Command { get; set; }

    [JsonPropertyName("isResolved")]
    public bool IsResolved { get; set; }
  }
}
