using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class EditCommandsCodeParams
  {

    [JsonPropertyName("instruction")]
    public string Instruction { get; set; }

    [JsonPropertyName("model")]
    public string Model { get; set; }

    [JsonPropertyName("mode")]
    public ModeEnum Mode { get; set; } // Oneof: edit, insert

    [JsonPropertyName("range")]
    public Range Range { get; set; }

    public enum ModeEnum
    {
      [JsonPropertyName("edit")]
      Edit,
      [JsonPropertyName("insert")]
      Insert,
    }
  }
}
