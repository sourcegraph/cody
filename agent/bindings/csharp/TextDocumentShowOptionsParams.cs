using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TextDocumentShowOptionsParams
  {
    [JsonProperty(PropertyName = "preserveFocus")]
    public bool PreserveFocus { get; set; }
    [JsonProperty(PropertyName = "preview")]
    public bool Preview { get; set; }
    [JsonProperty(PropertyName = "selection")]
    public Range Selection { get; set; }
  }
}
