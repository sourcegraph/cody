using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class EditTask
  {

    [JsonPropertyName("id")]
    public string Id { get; set; }

    [JsonPropertyName("state")]
    public CodyTaskState State { get; set; } // Oneof: Idle, Working, Inserting, Applying, Applied, Finished, Error, Pending

    [JsonPropertyName("error")]
    public CodyError Error { get; set; }

    [JsonPropertyName("selectionRange")]
    public Range SelectionRange { get; set; }

    [JsonPropertyName("instruction")]
    public string Instruction { get; set; }

    [JsonPropertyName("model")]
    public string Model { get; set; }

    [JsonPropertyName("originalText")]
    public string OriginalText { get; set; }
  }
}
