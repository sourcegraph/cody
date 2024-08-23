using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class SelectedCompletionInfo
  {
    [JsonProperty(PropertyName = "range")]
    public Range Range { get; set; }
    [JsonProperty(PropertyName = "text")]
    public string Text { get; set; }
  }
}
