using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ServerInfo
  {

    [JsonPropertyName("name")]
    public string Name { get; set; }

    [JsonPropertyName("authenticated")]
    public bool Authenticated { get; set; }

    [JsonPropertyName("codyEnabled")]
    public bool CodyEnabled { get; set; }

    [JsonPropertyName("codyVersion")]
    public string CodyVersion { get; set; }

    [JsonPropertyName("authStatus")]
    public AuthStatus AuthStatus { get; set; }
  }
}
