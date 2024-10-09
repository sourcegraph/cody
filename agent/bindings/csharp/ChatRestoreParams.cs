using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatRestoreParams
  {
    [JsonProperty(PropertyName = "modelID")]
    public string ModelID { get; set; }
    [JsonProperty(PropertyName = "messages")]
    public SerializedChatMessage[] Messages { get; set; }
    [JsonProperty(PropertyName = "chatID")]
    public string ChatID { get; set; }
  }
}
