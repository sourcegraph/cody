using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatWebNewResult
  {

    [JsonPropertyName("panelId")]
    public string PanelId { get; set; }

    [JsonPropertyName("chatId")]
    public string ChatId { get; set; }
  }
}
