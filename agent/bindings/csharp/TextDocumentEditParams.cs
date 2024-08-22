using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TextDocumentEditParams
  {

    [JsonPropertyName("uri")]
    public string Uri { get; set; }

    [JsonPropertyName("edits")]
    public TextEdit[] Edits { get; set; }

    [JsonPropertyName("options")]
    public OptionsParams Options { get; set; }
  }
}
