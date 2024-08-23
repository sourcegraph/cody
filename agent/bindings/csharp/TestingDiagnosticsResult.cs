using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TestingDiagnosticsResult
  {
    [JsonProperty(PropertyName = "diagnostics")]
    public ProtocolDiagnostic[] Diagnostics { get; set; }
  }
}
