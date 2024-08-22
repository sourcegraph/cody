using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ClientCapabilities
  {

    [JsonPropertyName("completions")]
    public CompletionsEnum Completions { get; set; } // Oneof: none

    [JsonPropertyName("chat")]
    public ChatEnum Chat { get; set; } // Oneof: none, streaming

    [JsonPropertyName("git")]
    public GitEnum Git { get; set; } // Oneof: none, enabled

    [JsonPropertyName("progressBars")]
    public ProgressBarsEnum ProgressBars { get; set; } // Oneof: none, enabled

    [JsonPropertyName("edit")]
    public EditEnum Edit { get; set; } // Oneof: none, enabled

    [JsonPropertyName("editWorkspace")]
    public EditWorkspaceEnum EditWorkspace { get; set; } // Oneof: none, enabled

    [JsonPropertyName("untitledDocuments")]
    public UntitledDocumentsEnum UntitledDocuments { get; set; } // Oneof: none, enabled

    [JsonPropertyName("showDocument")]
    public ShowDocumentEnum ShowDocument { get; set; } // Oneof: none, enabled

    [JsonPropertyName("codeLenses")]
    public CodeLensesEnum CodeLenses { get; set; } // Oneof: none, enabled

    [JsonPropertyName("showWindowMessage")]
    public ShowWindowMessageEnum ShowWindowMessage { get; set; } // Oneof: notification, request

    [JsonPropertyName("ignore")]
    public IgnoreEnum Ignore { get; set; } // Oneof: none, enabled

    [JsonPropertyName("codeActions")]
    public CodeActionsEnum CodeActions { get; set; } // Oneof: none, enabled

    [JsonPropertyName("webviewMessages")]
    public WebviewMessagesEnum WebviewMessages { get; set; } // Oneof: object-encoded, string-encoded

    [JsonPropertyName("globalState")]
    public GlobalStateEnum GlobalState { get; set; } // Oneof: stateless, server-managed, client-managed

    [JsonPropertyName("webview")]
    public WebviewEnum Webview { get; set; } // Oneof: agentic, native

    [JsonPropertyName("webviewNativeConfig")]
    public WebviewNativeConfigParams WebviewNativeConfig { get; set; }

    public enum CompletionsEnum
    {
      [JsonPropertyName("none")]
      None,
    }

    public enum ChatEnum
    {
      [JsonPropertyName("none")]
      None,
      [JsonPropertyName("streaming")]
      Streaming,
    }

    public enum GitEnum
    {
      [JsonPropertyName("none")]
      None,
      [JsonPropertyName("enabled")]
      Enabled,
    }

    public enum ProgressBarsEnum
    {
      [JsonPropertyName("none")]
      None,
      [JsonPropertyName("enabled")]
      Enabled,
    }

    public enum EditEnum
    {
      [JsonPropertyName("none")]
      None,
      [JsonPropertyName("enabled")]
      Enabled,
    }

    public enum EditWorkspaceEnum
    {
      [JsonPropertyName("none")]
      None,
      [JsonPropertyName("enabled")]
      Enabled,
    }

    public enum UntitledDocumentsEnum
    {
      [JsonPropertyName("none")]
      None,
      [JsonPropertyName("enabled")]
      Enabled,
    }

    public enum ShowDocumentEnum
    {
      [JsonPropertyName("none")]
      None,
      [JsonPropertyName("enabled")]
      Enabled,
    }

    public enum CodeLensesEnum
    {
      [JsonPropertyName("none")]
      None,
      [JsonPropertyName("enabled")]
      Enabled,
    }

    public enum ShowWindowMessageEnum
    {
      [JsonPropertyName("notification")]
      Notification,
      [JsonPropertyName("request")]
      Request,
    }

    public enum IgnoreEnum
    {
      [JsonPropertyName("none")]
      None,
      [JsonPropertyName("enabled")]
      Enabled,
    }

    public enum CodeActionsEnum
    {
      [JsonPropertyName("none")]
      None,
      [JsonPropertyName("enabled")]
      Enabled,
    }

    public enum WebviewMessagesEnum
    {
      [JsonPropertyName("object-encoded")]
      Object-encoded,
      [JsonPropertyName("string-encoded")]
      String-encoded,
    }

    public enum GlobalStateEnum
    {
      [JsonPropertyName("stateless")]
      Stateless,
      [JsonPropertyName("server-managed")]
      Server-managed,
      [JsonPropertyName("client-managed")]
      Client-managed,
    }

    public enum WebviewEnum
    {
      [JsonPropertyName("agentic")]
      Agentic,
      [JsonPropertyName("native")]
      Native,
    }
  }
}
