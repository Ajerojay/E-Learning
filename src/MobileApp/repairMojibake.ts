const cp1252Bytes: Record<number, number> = {
  0x81: 0x81,
  0x8d: 0x8d,
  0x8f: 0x8f,
  0x90: 0x90,
  0x9d: 0x9d,
  0x20ac: 0x80,
  0x201a: 0x82,
  0x192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x2c6: 0x88,
  0x2030: 0x89,
  0x160: 0x8a,
  0x2039: 0x8b,
  0x152: 0x8c,
  0x17d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x2dc: 0x98,
  0x2122: 0x99,
  0x161: 0x9a,
  0x203a: 0x9b,
  0x153: 0x9c,
  0x17e: 0x9e,
  0x178: 0x9f,
};

function repairText(value: string): string {
  if (!/[ðâÂÃ]/.test(value)) return value;

  let repaired = value;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const bytes = [] as number[];
    for (const character of repaired) {
      const codePoint = character.codePointAt(0) ?? 0;
      const byte = codePoint <= 0xff ? codePoint : cp1252Bytes[codePoint];
      if (byte === undefined) return value;
      bytes.push(byte);
    }

    const next = new TextDecoder().decode(new Uint8Array(bytes));
    if (next === repaired) break;
    repaired = next;
  }
  return repaired;
}

function repairTree(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    textNodes.push(node as Text);
    node = walker.nextNode();
  }

  for (const textNode of textNodes) {
    if (textNode.nodeValue) textNode.nodeValue = repairText(textNode.nodeValue);
  }

  if (root instanceof Element) {
    for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
      for (const attribute of ["title", "aria-label", "placeholder"]) {
        const value = element.getAttribute(attribute);
        if (value) element.setAttribute(attribute, repairText(value));
      }
    }
  }
}

export function installMojibakeRepair() {
  repairTree(document.body);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData" && mutation.target.nodeValue) {
        mutation.target.nodeValue = repairText(mutation.target.nodeValue);
      }
      for (const addedNode of Array.from(mutation.addedNodes)) {
        repairTree(addedNode);
      }
    }
  });
  observer.observe(document.body, {
    characterData: true,
    childList: true,
    subtree: true,
  });
  return () => observer.disconnect();
}