using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatModelsParams
  {
    [JsonProperty(PropertyName = "modelUsage")]
    public ModelUsage ModelUsage { get; set; } // Oneof: chat, edit, autocomplete
  }
}
