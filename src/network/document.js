/** Server-only script subtrees may contain secrets/private modules and are never sent to clients. */
export function clientDocument(project) {
  const copy = structuredClone(project);
  const redact = (node) => {
    node.children = node.children.filter(
      (child) => !['Script', 'ServerScript'].includes(child.className),
    );
    node.children.forEach(redact);
  };
  copy.services.forEach(redact);
  return copy;
}
