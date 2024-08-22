using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingProgressCancelationParams
  {

    [JsonPropertyName("title")]
    public string Title { get; set; }
  }
}
