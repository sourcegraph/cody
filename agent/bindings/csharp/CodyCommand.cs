using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CodyCommand
  {
    [JsonProperty(PropertyName = "slashCommand")]
    public string SlashCommand { get; set; }
    [JsonProperty(PropertyName = "key")]
    public string Key { get; set; }
    [JsonProperty(PropertyName = "prompt")]
    public string Prompt { get; set; }
    [JsonProperty(PropertyName = "description")]
    public string Description { get; set; }
    [JsonProperty(PropertyName = "context")]
    public CodyCommandContext Context { get; set; }
    [JsonProperty(PropertyName = "type")]
    public CodyCommandType Type { get; set; } // Oneof: workspace, user, default, experimental, recently used
    [JsonProperty(PropertyName = "mode")]
    public CodyCommandMode Mode { get; set; } // Oneof: ask, edit, insert
    [JsonProperty(PropertyName = "requestID")]
    public string RequestID { get; set; }
  }
}
