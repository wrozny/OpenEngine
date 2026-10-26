/** Body/fixture events become one enter/leave pair per instance pair, including teardown. */
export class CollisionEvents {
  constructor() {
    this.pairs = new Map();
  }
  key(a, b) {
    return a.Id < b.Id ? a.Id + '\0' + b.Id : b.Id + '\0' + a.Id;
  }
  dispatch(a, b, event) {
    const key = this.key(a, b),
      pair = this.pairs.get(key);
    if (event === 'begin-contact') {
      if (a.Destroyed || b.Destroyed || !a._body || !b._body) return;
      if (pair) {
        pair.count++;
        return;
      }
      this.pairs.set(key, { a, b, count: 1 });
      a.OnCollisionStart.Fire(b);
      if (!a.Destroyed && !b.Destroyed) b.OnCollisionStart.Fire(a);
    } else if (pair && --pair.count <= 0) this.end(key, pair);
  }
  end(key, pair) {
    this.pairs.delete(key);
    if (!pair.a.Destroyed) pair.a.OnCollisionEnd.Fire(pair.b);
    if (!pair.b.Destroyed) pair.b.OnCollisionEnd.Fire(pair.a);
  }
  remove(node) {
    for (const [key, pair] of [...this.pairs])
      if (pair.a === node || pair.b === node) this.end(key, pair);
  }
  touching(node) {
    return [...this.pairs.values()]
      .filter((p) => p.a === node || p.b === node)
      .map((p) => (p.a === node ? p.b : p.a));
  }
  clear() {
    this.pairs.clear();
  }
}
