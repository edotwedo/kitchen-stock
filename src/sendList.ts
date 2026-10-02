/**
 * Hands the shopping list to the phone's share sheet (Messages, email…), or copies it where sharing isn't offered.
 * Returns what to tell the person, or "" when the share sheet took it (or they closed it themselves).
 */
export async function sendShoppingList(text: string, nav: Pick<Navigator, "share" | "clipboard"> = navigator): Promise<string> {
  if (typeof nav.share === "function") {
    try {
      await nav.share({ title: "Shopping list", text });
      return "";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "";
      // Some browsers have share but refuse it here: fall back to copying.
    }
  }
  try {
    await nav.clipboard.writeText(text);
    return "Shopping list copied. Paste it into a text or email.";
  } catch {
    return "Couldn't copy here. Try Print sheets in Settings instead.";
  }
}
