using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class EditCommandsCodeParams
  {
    [JsonProperty(PropertyName = "instruction")]
    public string Instruction { get; set; }
    [JsonProperty(PropertyName = "model")]
    public string Model { get; set; }
    [JsonProperty(PropertyName = "mode")]
    public ModeEnum Mode { get; set; } // Oneof: edit, insert
    [JsonProperty(PropertyName = "range")]
    public Range Range { get; set; }

    public enum ModeEnum
    {
      [EnumMember(Value = "edit")]
      Edit,
      [EnumMember(Value = "insert")]
      Insert,
    }
  }
}
