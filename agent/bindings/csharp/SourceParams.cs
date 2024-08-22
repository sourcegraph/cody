using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class SourceParams
  {

    [JsonPropertyName("client")]
    public string Client { get; set; }

    [JsonPropertyName("clientVersion")]
    public string ClientVersion { get; set; }
  }
}
