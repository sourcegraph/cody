using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatExportParams
  {

    [JsonPropertyName("fullHistory")]
    public bool FullHistory { get; set; }
  }
}
