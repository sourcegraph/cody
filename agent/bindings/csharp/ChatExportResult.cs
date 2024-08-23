using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatExportResult
  {
    [JsonProperty(PropertyName = "chatID")]
    public string ChatID { get; set; }
    [JsonProperty(PropertyName = "transcript")]
    public SerializedChatTranscript Transcript { get; set; }
  }
}
