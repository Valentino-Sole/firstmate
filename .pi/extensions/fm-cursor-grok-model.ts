import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { patchCursorGrokProviderPayload } from "./lib/fm-cursor-grok-model.ts";

export default function (pi: ExtensionAPI) {
  pi.on("before_provider_request", (event, ctx) => {
    if (ctx.model?.provider !== "cursor") return;
    return patchCursorGrokProviderPayload(event.payload, ctx.model?.id, ctx.thinkingLevel);
  });
}
