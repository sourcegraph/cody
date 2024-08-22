using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatRestoreParams
  {

    [JsonPropertyName("modelID")]
    public string ModelID { get; set; }

    [JsonPropertyName("messages")]
    public SerializedChatMessage[] Messages { get; set; }

    [JsonPropertyName("chatID")]
    public string ChatID { get; set; }
  }
}
