using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CodyCommand
  {

    [JsonPropertyName("slashCommand")]
    public string SlashCommand { get; set; }

    [JsonPropertyName("key")]
    public string Key { get; set; }

    [JsonPropertyName("prompt")]
    public string Prompt { get; set; }

    [JsonPropertyName("description")]
    public string Description { get; set; }

    [JsonPropertyName("context")]
    public CodyCommandContext Context { get; set; }

    [JsonPropertyName("type")]
    public CodyCommandType Type { get; set; } // Oneof: workspace, user, default, experimental, recently used

    [JsonPropertyName("mode")]
    public CodyCommandMode Mode { get; set; } // Oneof: ask, edit, insert

    [JsonPropertyName("requestID")]
    public string RequestID { get; set; }
  }
}
