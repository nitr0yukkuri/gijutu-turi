/** Lets the most recently started async read own the displayed state. */
export class LatestRequestGuard {
  private revision = 0;

  begin(): number {
    this.revision += 1;
    return this.revision;
  }

  isCurrent(revision: number): boolean {
    return revision === this.revision;
  }
}
