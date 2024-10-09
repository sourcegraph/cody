using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatSidebarNewResult
  {
    [JsonProperty(PropertyName = "panelId")]
    public string PanelId { get; set; }
    [JsonProperty(PropertyName = "chatId")]
    public string ChatId { get; set; }
  }
}
