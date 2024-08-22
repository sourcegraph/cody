using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatDeleteParams
  {

    [JsonPropertyName("chatId")]
    public string ChatId { get; set; }
  }
}
