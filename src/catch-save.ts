import type { CatchSaveStatus } from "./ocean-contract.js";

/** Keeps one room's capture write retryable without changing its idempotency key. */
export class CatchSaveCoordinator {
  private eventKey: string | undefined;
  private write: Promise<void> | undefined;
  private currentStatus: CatchSaveStatus = "none";

  get status(): CatchSaveStatus {
    return this.currentStatus;
  }

  save(eventKey: string, persist: () => void | Promise<void>): Promise<void> {
    if (this.eventKey !== eventKey) {
      if (this.currentStatus === "pending") return this.write ?? Promise.resolve();
      this.eventKey = eventKey;
      this.currentStatus = "none";
    }

    if (this.currentStatus === "saved") return Promise.resolve();
    if (this.currentStatus === "pending") return this.write ?? Promise.resolve();

    this.currentStatus = "pending";
    const write = Promise.resolve()
      .then(persist)
      .then(
        () => { if (this.eventKey === eventKey) this.currentStatus = "saved"; },
        error => {
          if (this.eventKey === eventKey) this.currentStatus = "failed";
          throw error;
        },
      )
      .finally(() => {
        if (this.write === write) this.write = undefined;
      });
    this.write = write;
    return write;
  }
}
