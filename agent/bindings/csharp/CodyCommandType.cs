using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  public enum CodyCommandType
  {
    [JsonPropertyName("workspace")]
    Workspace,
    [JsonPropertyName("user")]
    User,
    [JsonPropertyName("default")]
    Default,
    [JsonPropertyName("experimental")]
    Experimental,
    [JsonPropertyName("recently used")]
    Recently used,
  }
}
