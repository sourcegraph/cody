using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatExportResult
  {

    [JsonPropertyName("chatID")]
    public string ChatID { get; set; }

    [JsonPropertyName("transcript")]
    public SerializedChatTranscript Transcript { get; set; }
  }
}
