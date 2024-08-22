using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingProgressCancelationResult
  {

    [JsonPropertyName("result")]
    public string Result { get; set; }
  }
}
