using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class SourceParams
  {
    [JsonProperty(PropertyName = "client")]
    public string Client { get; set; }
    [JsonProperty(PropertyName = "clientVersion")]
    public string ClientVersion { get; set; }
  }
}
