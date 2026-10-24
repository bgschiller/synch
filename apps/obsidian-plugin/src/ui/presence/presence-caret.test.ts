// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import {
  applyRemotePresence,
  createSynchPresenceEditorExtension,
} from "./presence-editor";

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.replaceChildren();
  Reflect.deleteProperty(document.body, "createSpan");
});

describe("presence caret rendering", () => {
  it("keeps peer names out of editor DOM text that mobile editing can absorb", () => {
    // Obsidian supplies this DOM helper in the application.
    Object.assign(document.body, {
      createSpan({ cls }: { cls: string }): HTMLSpanElement {
        const span = document.createElement("span");
        span.className = cls;
        document.body.appendChild(span);
        return span;
      },
    });
    view = new EditorView({
      state: EditorState.create({
        doc: "hello",
        extensions: createSynchPresenceEditorExtension(() => {}),
      }),
      parent: document.body,
    });

    applyRemotePresence(view, [{
      presenceId: "peer-1",
      label: "Alice <mobile editor>",
      color: "red",
      line: 0,
      ch: 3,
    }], []);

    const caret = view.contentDOM.querySelector(".synch-presence-caret");
    expect(caret).not.toBeNull();
    expect(caret?.textContent).toBe("");
    expect(caret?.getAttribute("contenteditable")).toBe("false");
    expect(caret?.querySelector(".synch-presence-caret-label")?.getAttribute("data-label"))
      .toBe("Alice <mobile editor>");
    expect(view.contentDOM.textContent).toBe("hello");
    expect(view.state.doc.toString()).toBe("hello");
  });
});
