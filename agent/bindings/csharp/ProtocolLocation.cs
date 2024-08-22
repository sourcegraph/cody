using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProtocolLocation
  {

    [JsonPropertyName("uri")]
    public string Uri { get; set; }

    [JsonPropertyName("range")]
    public Range Range { get; set; }
  }
}
