export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`, "not_found", 404);
  }
}

export class AuthorizationError extends DomainError {
  constructor(message = "not authorized") {
    super(message, "forbidden", 403);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, "invalid_input", 400);
  }
}

export class StateTransitionError extends DomainError {
  constructor(message: string) {
    super(message, "invalid_transition", 409);
  }
}
