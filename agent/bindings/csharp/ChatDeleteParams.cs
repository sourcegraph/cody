using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatDeleteParams
  {
    [JsonProperty(PropertyName = "chatId")]
    public string ChatId { get; set; }
  }
}
