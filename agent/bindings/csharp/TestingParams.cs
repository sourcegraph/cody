using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingParams
  {
    [JsonProperty(PropertyName = "selectedText")]
    public string SelectedText { get; set; }
    [JsonProperty(PropertyName = "sourceOfTruthDocument")]
    public ProtocolTextDocument SourceOfTruthDocument { get; set; }
  }
}
