using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CompletionItemParams
  {
    [JsonProperty(PropertyName = "completionID")]
    public string CompletionID { get; set; }
  }
}
