export class OpsError extends Error {
  constructor(message: string, public readonly code = "ops_error") {
    super(message);
    this.name = "OpsError";
  }
}
