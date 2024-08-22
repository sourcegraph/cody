using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatModelsParams
  {

    [JsonPropertyName("modelUsage")]
    public ModelUsage ModelUsage { get; set; } // Oneof: chat, edit, autocomplete
  }
}
