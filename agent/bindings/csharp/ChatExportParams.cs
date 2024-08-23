using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatExportParams
  {
    [JsonProperty(PropertyName = "fullHistory")]
    public bool FullHistory { get; set; }
  }
}
