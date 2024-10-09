using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class DisplayCodeLensParams
  {
    [JsonProperty(PropertyName = "uri")]
    public string Uri { get; set; }
    [JsonProperty(PropertyName = "codeLenses")]
    public ProtocolCodeLens[] CodeLenses { get; set; }
  }
}
