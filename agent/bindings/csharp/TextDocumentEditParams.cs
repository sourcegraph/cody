using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TextDocumentEditParams
  {
    [JsonProperty(PropertyName = "uri")]
    public string Uri { get; set; }
    [JsonProperty(PropertyName = "edits")]
    public TextEdit[] Edits { get; set; }
    [JsonProperty(PropertyName = "options")]
    public OptionsParams Options { get; set; }
  }
}
