using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingDiagnosticsResult
  {

    [JsonPropertyName("diagnostics")]
    public ProtocolDiagnostic[] Diagnostics { get; set; }
  }
}
