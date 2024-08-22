using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CompletionItemParams
  {

    [JsonPropertyName("completionID")]
    public string CompletionID { get; set; }
  }
}
