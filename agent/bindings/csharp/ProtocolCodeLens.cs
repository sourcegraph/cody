using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProtocolCodeLens
  {
    [JsonProperty(PropertyName = "range")]
    public Range Range { get; set; }
    [JsonProperty(PropertyName = "command")]
    public ProtocolCommand Command { get; set; }
    [JsonProperty(PropertyName = "isResolved")]
    public bool IsResolved { get; set; }
  }
}
