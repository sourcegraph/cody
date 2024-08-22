using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatSidebarNewResult
  {

    [JsonPropertyName("panelId")]
    public string PanelId { get; set; }

    [JsonPropertyName("chatId")]
    public string ChatId { get; set; }
  }
}
