using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ServerInfo
  {
    [JsonProperty(PropertyName = "name")]
    public string Name { get; set; }
    [JsonProperty(PropertyName = "authenticated")]
    public bool Authenticated { get; set; }
    [JsonProperty(PropertyName = "codyEnabled")]
    public bool CodyEnabled { get; set; }
    [JsonProperty(PropertyName = "codyVersion")]
    public string CodyVersion { get; set; }
    [JsonProperty(PropertyName = "authStatus")]
    public AuthStatus AuthStatus { get; set; }
  }
}
