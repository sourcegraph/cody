using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class SelectedCompletionInfo
  {

    [JsonPropertyName("range")]
    public Range Range { get; set; }

    [JsonPropertyName("text")]
    public string Text { get; set; }
  }
}
