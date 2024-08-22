using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingParams
  {

    [JsonPropertyName("selectedText")]
    public string SelectedText { get; set; }

    [JsonPropertyName("sourceOfTruthDocument")]
    public ProtocolTextDocument SourceOfTruthDocument { get; set; }
  }
}
