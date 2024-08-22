using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingDiagnosticsParams
  {

    [JsonPropertyName("uri")]
    public string Uri { get; set; }
  }
}
