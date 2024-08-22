using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingProgressParams
  {

    [JsonPropertyName("title")]
    public string Title { get; set; }
  }
}
